import os
import sys
import time
import shutil
import urllib.request
import subprocess
import signal
import stat
import re

# --- Bravy Tech Branding ---
BOT_NAME = "Bravy Tech Bot"
RESTART_DELAY = 2.0  # Seconds

if sys.platform.startswith('win'):
    BINARY_NAME = "tct-windows.exe"
elif sys.platform.startswith('darwin'):
    BINARY_NAME = "tct-macos"
else:
    BINARY_NAME = "tct-linux"

PROGRAM_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), BINARY_NAME)

DOWNLOAD_URL = f"https://github.com/i-tct/tct/releases/latest/download/{BINARY_NAME}"
CONFIG_TEMPLATE_URL = "https://gist.githubusercontent.com/i-tct/1433de6fbe3a14f2178e5429b46c31c0/raw"

child_process = None

def download_file(url, dest_path):
    """Downloads a file natively, automatically following redirects."""
    try:
        with urllib.request.urlopen(url) as response, open(dest_path, 'wb') as out_file:
            shutil.copyfileobj(response, out_file)
    except Exception as e:
        if os.path.exists(dest_path):
            os.remove(dest_path)
        raise e

def download_binary():
    """Checks binary integrity and downloads if missing or corrupted."""
    if os.path.exists(PROGRAM_PATH):
        if os.stat(PROGRAM_PATH).st_size > 100000:
            return  # File exists and seems valid
        print(f"[{BOT_NAME}] Core binary corrupted. Repairing...")
        os.remove(PROGRAM_PATH)

    print(f"[{BOT_NAME}] Initializing engine... downloading from source.")
    download_file(DOWNLOAD_URL, PROGRAM_PATH)

    if not sys.platform.startswith('win'):
        try:
            st = os.stat(PROGRAM_PATH)
            os.chmod(PROGRAM_PATH, st.st_mode | stat.S_IEXEC)
        except Exception as e:
            print(f"Warning: Failed to set executable permissions: {e}")
            
    print(f"[{BOT_NAME}] Engine downloaded successfully.")

def generate_config():
    """Finds or downloads the config, then overrides with Env Vars."""
    candidates = ["TCTfile", "tctfile", "tctfile.yml", "config.yml"]
    config_file = "tctfile"
    content = ""
    found = False

    for c in candidates:
        if os.path.exists(c):
            config_file = c
            with open(c, "r", encoding="utf-8") as f:
                content = f.read()
            print(f"[{BOT_NAME}] Configuration detected: {config_file}")
            found = True
            break

    if not found:
        print(f"[{BOT_NAME}] ⚠️ First-time setup: Fetching default configuration...")
        try:
            download_file(CONFIG_TEMPLATE_URL, config_file)
            with open(config_file, "r", encoding="utf-8") as f:
                content = f.read()
            print(f"[{BOT_NAME}] ✅ Configuration template ready.")
        except Exception as e:
            print(f"[{BOT_NAME}] ❌ Configuration failed: {e}")

    lines = content.split('\n') if content else []

    def force_override_env_vars(key, value):
        if not value:
            return

        escaped = value.replace('\\', '\\\\').replace('"', '\\"')
        new_line = f'{key}: "{escaped}"'
        
        pattern = re.compile(rf'^{key}\s*:', re.IGNORECASE)
        key_found = False

        for i in range(len(lines)):
            if pattern.match(lines[i]):
                lines[i] = new_line
                key_found = True
                break

        if not key_found:
            lines.append(new_line)

    # Standard Variables
    force_override_env_vars("SESSION_ID", os.environ.get("SESSION_ID"))
    force_override_env_vars("PREFIX", os.environ.get("PREFIX"))
    force_override_env_vars("TIMEZONE", os.environ.get("TIMEZONE"))
    force_override_env_vars("OPENWEATHER_API_KEY", os.environ.get("OPENWEATHER_API_KEY"))
    
    # Postgres Cloud Sync Variables
    force_override_env_vars("POSTGRES_URL", os.environ.get("POSTGRES_URL"))
    force_override_env_vars("POSTGRES_SYNC_INTERVAL", os.environ.get("POSTGRES_SYNC_INTERVAL"))

    dynamic_port = os.environ.get("PORT") or os.environ.get("server_port") or os.environ.get("SERVER_PORT")
    if dynamic_port:
        force_override_env_vars("SERVER_PORT", dynamic_port)

    # Save changes
    with open(config_file, "w", encoding="utf-8") as f:
        f.write('\n'.join(lines))

def shutdown(signum, frame):
    """Graceful shutdown handler for OS signals."""
    print(f"\n[{BOT_NAME}] Powering down...")
    global child_process
    if child_process:
        child_process.terminate()
    sys.exit(0)

# Register shutdown signals
signal.signal(signal.SIGINT, shutdown)
signal.signal(signal.SIGTERM, shutdown)

def start_bot_loop():
    """Runs the bot in a loop to handle restarts automatically."""
    global child_process
    
    try:
        if not sys.platform.startswith('win'):
            st = os.stat(PROGRAM_PATH)
            os.chmod(PROGRAM_PATH, st.st_mode | stat.S_IEXEC)
    except Exception:
        pass

    generate_config()
    print(f"[{BOT_NAME}] System Online. Launching main process...")

    while True:
        try:
            child_process = subprocess.Popen([PROGRAM_PATH], env=os.environ)
            child_process.wait()
            
            print(f"[{BOT_NAME}] Process exited with code {child_process.returncode}")
            print(f"[{BOT_NAME}] Attempting automatic restart in {RESTART_DELAY}s...\n")
            time.sleep(RESTART_DELAY)
            
        except Exception as e:
            print(f"[{BOT_NAME}] Critical failure: {e}")
            time.sleep(RESTART_DELAY)

def main():
    try:
        download_binary()
        start_bot_loop()
    except Exception as e:
        print(f"[{BOT_NAME}] Startup failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
