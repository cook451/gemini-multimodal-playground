"use client";

import { useState, useEffect, useRef } from 'react';

interface VideoSelectorProps {
    onStreamChange: (stream: MediaStream) => void;
}

function VideoSelector({ onStreamChange }: VideoSelectorProps) {
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
    const videoRef = useRef<HTMLVideoElement>(null);
    const currentStreamRef = useRef<MediaStream | null>(null);

    // Initial setup
    useEffect(() => {
        async function setupCamera() {
            try {
                // Get initial stream
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                currentStreamRef.current = stream;
                
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                onStreamChange(stream);

                // Get available devices
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoDevices = devices.filter(device => device.kind === 'videoinput');
                setDevices(videoDevices);
                
                // Set initial device
                if (videoDevices.length > 0) {
                    const initialDevice = videoDevices[0];
                    setSelectedDeviceId(initialDevice.deviceId);
                }
            } catch (error) {
                console.error('Camera setup error:', error);
            }
        }

        setupCamera();

        // Cleanup
        return () => {
            if (currentStreamRef.current) {
                currentStreamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []); // Remove onStreamChange from dependencies

    const handleDeviceChange = async (deviceId: string) => {
        if (deviceId === selectedDeviceId) return;

        try {
            // Stop current stream
            if (currentStreamRef.current) {
                currentStreamRef.current.getTracks().forEach(track => track.stop());
            }

            // Get new stream
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    deviceId: { exact: deviceId },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            currentStreamRef.current = newStream;
            
            if (videoRef.current) {
                videoRef.current.srcObject = newStream;
            }
            
            setSelectedDeviceId(deviceId);
            onStreamChange(newStream);
        } catch (error) {
            console.error('Error switching camera:', error);
        }
    };

    return (
        <div className="relative w-full h-full">
            <select 
                onChange={(e) => handleDeviceChange(e.target.value)}
                value={selectedDeviceId}
                className="absolute top-4 right-4 z-10 bg-white border rounded px-2 py-1"
            >
                {devices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Camera ${device.deviceId}`}
                    </option>
                ))}
            </select>
            
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                }}
            />
        </div>
    );
}

export default VideoSelector; 