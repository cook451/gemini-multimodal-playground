import subprocess
import sys
import time
import os
from pathlib import Path

def kill_ports_forcefully():
    """Kill processes on all potential ports more aggressively"""
    print("Forcefully stopping all existing services...")
    
    if sys.platform == 'darwin':  # macOS
        # Kill Next.js ports
        for port in range(3000, 3010):
            subprocess.run(f'lsof -i :{port} | grep LISTEN | awk \'{{print $2}}\' | xargs kill -9', 
                         shell=True, stderr=subprocess.DEVNULL)
        # Kill backend port
        subprocess.run('lsof -i :8000 | grep LISTEN | awk \'{print $2}\' | xargs kill -9', 
                      shell=True, stderr=subprocess.DEVNULL)
    
    elif sys.platform == 'win32':  # Windows
        for port in range(3000, 3010):
            subprocess.run(f'FOR /F "tokens=5" %P IN (\'netstat -a -n -o ^| findstr :{port}\') DO TaskKill /PID %P /F', 
                         shell=True, stderr=subprocess.DEVNULL)
        subprocess.run('FOR /F "tokens=5" %P IN (\'netstat -a -n -o ^| findstr :8000\') DO TaskKill /PID %P /F', 
                      shell=True, stderr=subprocess.DEVNULL)
    
    else:  # Linux
        # Kill Next.js ports
        ports = ",".join(str(port) for port in range(3000, 3010))
        subprocess.run(f'fuser -k {ports}/tcp', shell=True, stderr=subprocess.DEVNULL)
        # Kill backend port
        subprocess.run('fuser -k 8000/tcp', shell=True, stderr=subprocess.DEVNULL)

def main():
    # Get the project root directory
    project_root = Path(__file__).parent
    backend_dir = project_root / "backend"
    frontend_dir = project_root / "frontend"

    print(f"Starting Gemini Chat from {project_root}...")
    
    # Kill existing processes
    kill_ports_forcefully()
    print("Waiting for ports to clear...")
    time.sleep(5)  # Increased wait time to ensure ports are cleared

    # Start backend
    print("Starting backend server...")
    backend = subprocess.Popen(
        ["uvicorn", "main:app", "--reload"],
        cwd=str(backend_dir)
    )

    # Give backend a moment to start
    time.sleep(2)

    # Start frontend
    print("Starting frontend...")
    frontend = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=str(frontend_dir)
    )

    print("\nGemini Chat is running!")
    print("Access the application at: http://localhost:3000")
    print("Press Ctrl+C to stop all services")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down Gemini Chat...")
        frontend.terminate()
        backend.terminate()
        print("All services stopped")

if __name__ == "__main__":
    main() 