import os
import signal
import subprocess
import sys
import time
import psutil

def find_process_by_port(port):
    for proc in psutil.process_iter(['pid', 'name']):
        try:
            connections = proc.connections()
            for conn in connections:
                if hasattr(conn, 'laddr') and conn.laddr.port == port:
                    return proc.pid
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
    return None

def kill_process_on_port(port):
    pid = find_process_by_port(port)
    if pid:
        try:
            if sys.platform == 'win32':
                subprocess.run(['taskkill', '/F', '/PID', str(pid)], check=True)
            else:
                os.kill(pid, signal.SIGTERM)
            print(f"Killed process on port {port}")
        except Exception as e:
            print(f"Error killing process on port {port}: {e}")

def main():
    # Kill existing processes
    print("Stopping existing services...")
    kill_process_on_port(3000)  # Frontend port
    kill_process_on_port(8000)  # Backend port
    
    time.sleep(2)  # Wait for processes to fully terminate

    # Start backend
    print("Starting backend...")
    backend = subprocess.Popen(
        ["uvicorn", "main:app", "--reload"],
        cwd="backend"
    )

    # Start frontend
    print("Starting frontend...")
    frontend = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd="frontend"
    )

    try:
        # Keep the script running and services alive
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down services...")
        frontend.terminate()
        backend.terminate()
        frontend.wait()
        backend.wait()
        print("All services stopped")

if __name__ == "__main__":
    # Install required package if not present
    try:
        import psutil
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "psutil"])
        import psutil
    
    main() 