'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Mic, StopCircle, Video } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { base64ToFloat32Array, float32ToPcm16 } from '@/lib/utils';

interface Config {
  systemPrompt: string;
  voice: string;
  googleSearch: boolean;
}

export default function GeminiVoiceChat() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [config, setConfig] = useState<Config>({
    systemPrompt: "You are a friendly Gemini 2.0 model. Respond verbally in a casual, helpful tone.",
    voice: "Puck",
    googleSearch: true,
  });
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioInputRef = useRef<{
    source: MediaStreamAudioSourceNode;
    processor: ScriptProcessorNode;
    stream: MediaStream;
  } | null>(null);
  const clientId = useRef(crypto.randomUUID());
  const [videoEnabled, setVideoEnabled] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [chatMode, setChatMode] = useState<'audio' | 'video' | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');

  const voices = ["Puck", "Charon", "Kore", "Fenrir", "Aoede"];
  const audioBuffer: Float32Array[] = [];
  let isPlaying = false;

  const startStream = async (mode: 'audio' | 'video') => {
    setChatMode(mode);
    const ws = new WebSocket(`ws://localhost:8000/ws/${clientId.current}`);
    wsRef.current = ws;

    ws.onopen = async () => {
      ws.send(JSON.stringify({
        type: 'config',
        config: config
      }));

      await startAudioStream();
      if (mode === 'video') {
        setVideoEnabled(true);
      }
      setIsStreaming(true);
      setIsConnected(true);
    };

    ws.onmessage = async (event: MessageEvent) => {
      const response = JSON.parse(event.data);
      if (response.type === 'audio') {
        const audioData = base64ToFloat32Array(response.data);
        playAudioData(audioData);
      } else if (response.type === 'text') {
        setText(prev => prev + response.text + '\n');
      }
    };

    ws.onerror = (error: Event) => {
      setError(`WebSocket error: ${error.toString()}`);
      setIsStreaming(false);
    };

    ws.onclose = () => {
      setIsStreaming(false);
    };
  };

  const startAudioStream = async () => {
    try {
      const ctx = new (window.AudioContext || window.AudioContext)({
        sampleRate: 16000
      });
      audioContextRef.current = ctx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(512, 1, 1);

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmData = float32ToPcm16(Array.from(inputData));
          const uint8Array = new Uint8Array(pcmData.buffer);
          const base64Data = btoa(String.fromCharCode(...uint8Array));
          wsRef.current.send(JSON.stringify({
            type: 'audio',
            data: base64Data
          }));
        }
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      audioInputRef.current = { source, processor, stream };
      setIsStreaming(true);
    } catch (err) {
      setError(`Failed to access microphone: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const playAudioData = async (audioData: Float32Array) => {
    audioBuffer.push(audioData);
    if (!isPlaying) {
      playNextInQueue();
    }
  };

  const playNextInQueue = async () => {
    if (!audioContextRef.current || audioBuffer.length === 0) {
      isPlaying = false;
      return;
    }

    isPlaying = true;
    const audioData = audioBuffer.shift();
    if (!audioData) return;

    const buffer = audioContextRef.current.createBuffer(1, audioData.length, 24000);
    buffer.copyToChannel(audioData, 0);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      playNextInQueue();
    };
    source.start();
  };

  const getVideoDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setVideoDevices(videoDevices);
      if (videoDevices.length > 0) {
        setSelectedCamera(videoDevices[0].deviceId);
      }
    } catch (err) {
      console.error('Error getting video devices:', err);
      setError('Failed to get camera list');
    }
  };

  useEffect(() => {
    getVideoDevices();
  }, []);

  useEffect(() => {
    if (videoEnabled && videoRef.current) {
      const startVideo = async () => {
        if (!videoRef.current) return;

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: selectedCamera ? { exact: selectedCamera } : undefined,
              width: { ideal: 320 },
              height: { ideal: 240 }
            }
          });

          videoRef.current.srcObject = stream;
          videoStreamRef.current = stream;

          videoIntervalRef.current = setInterval(() => {
            captureAndSendFrame();
          }, 1000);

        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error('Video initialization error:', errorMessage);
          setError('Failed to access camera: ' + errorMessage);
          setVideoEnabled(false);
        }
      };

      startVideo();

      // Cleanup function
      return () => {
        if (videoStreamRef.current) {
          videoStreamRef.current.getTracks().forEach(track => track.stop());
          videoStreamRef.current = null;
        }
        if (videoIntervalRef.current) {
          clearInterval(videoIntervalRef.current);
          videoIntervalRef.current = null;
        }
      };
    }
  }, [videoEnabled]);

  // Frame capture function
  const captureAndSendFrame = () => {
    if (!canvasRef.current || !videoRef.current || !wsRef.current) return;

    const context = canvasRef.current.getContext('2d');
    if (!context) return;

    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;

    context.drawImage(videoRef.current, 0, 0);
    const base64Image = canvasRef.current.toDataURL('image/jpeg').split(',')[1];

    wsRef.current.send(JSON.stringify({
      type: 'image',
      data: base64Image
    }));
  };

  // Toggle video function
  const toggleVideo = () => {
    setVideoEnabled(!videoEnabled);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, []);

  const stopStream = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (audioInputRef.current) {
      audioInputRef.current.source.disconnect();
      audioInputRef.current.processor.disconnect();
      audioInputRef.current.stream.getTracks().forEach(track => track.stop());
      audioInputRef.current = null;
    }

    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(track => track.stop());
      videoStreamRef.current = null;
    }

    setIsStreaming(false);
    setIsConnected(false);
    setChatMode(null);
    setVideoEnabled(false);
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="space-y-6">
        <h1 className="text-4xl font-bold tracking-tight">Gemini 2.0 ✨</h1>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="system-prompt">Base Prompt</Label>
              <Textarea
                id="system-prompt"
                value={config.systemPrompt}
                onChange={(e) => setConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                disabled={isConnected}
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="voice-select">Voice</Label>
              <Select
                value={config.voice}
                onValueChange={(value) => setConfig(prev => ({ ...prev, voice: value }))}
                disabled={isConnected}
              >
                <SelectTrigger id="voice-select">
                  <SelectValue placeholder="Select a voice" />
                </SelectTrigger>
                <SelectContent>
                  {voices.map((voice) => (
                    <SelectItem key={voice} value={voice}>
                      {voice}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="google-search"
                checked={config.googleSearch}
                onCheckedChange={(checked) =>
                  setConfig(prev => ({ ...prev, googleSearch: checked as boolean }))}
                disabled={isConnected}
              />
              <Label htmlFor="google-search">Enable Google Search</Label>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          {!isStreaming && (
            <>
              <Button
                onClick={() => startStream('audio')}
                disabled={isStreaming}
                className="gap-2"
              >
                <Mic className="h-4 w-4" />
                Start Chatting
              </Button>

              <Button
                onClick={() => startStream('video')}
                disabled={isStreaming}
                className="gap-2"
              >
                <Video className="h-4 w-4" />
                Start Chatting with Video
              </Button>
            </>
          )}

          {isStreaming && (
            <Button
              onClick={stopStream}
              variant="destructive"
              className="gap-2"
            >
              <StopCircle className="h-4 w-4" />
              Stop Chat
            </Button>
          )}
        </div>

        {/*
        {isStreaming && (
          <Card>
            <CardContent className="flex items-center justify-center h-24 mt-6">
              <div className="flex flex-col items-center gap-2">
                <Mic className="h-8 w-8 text-blue-500 animate-pulse" />
                <p className="text-gray-600">Listening...</p>
              </div>
            </CardContent>
          </Card>
        )}
        */}

        {chatMode === 'video' && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">Video Input</h2>
              </div>

              <div className="space-y-2">
                <Label htmlFor="camera-select">Camera</Label>
                <Select
                  value={selectedCamera}
                  onValueChange={(value) => {
                    setSelectedCamera(value);
                    if (videoStreamRef.current) {
                      videoStreamRef.current.getTracks().forEach(track => track.stop());
                      setVideoEnabled(false);
                      setTimeout(() => setVideoEnabled(true), 100);
                    }
                  }}
                >
                  <SelectTrigger id="camera-select">
                    <SelectValue placeholder="Select a camera" />
                  </SelectTrigger>
                  <SelectContent>
                    {videoDevices.map((device, index) => (
                      <SelectItem
                        key={device.deviceId}
                        value={device.deviceId || `camera-${index + 1}`}
                      >
                        {device.label || `Camera ${index + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  width={320}
                  height={240}
                  className="w-full h-full object-contain"
                  style={{ transform: 'scaleX(-1)' }}
                />
                <canvas
                  ref={canvasRef}
                  className="hidden"
                  width={640}
                  height={480}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {text && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold mb-2">Conversation:</h2>
              <pre className="whitespace-pre-wrap text-gray-700">{text}</pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}