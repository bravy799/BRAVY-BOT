const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

// --- Bravy Tech Branding ---
const BOT_NAME = "Bravy Tech Bot";
const RESTART_DELAY = 2000;

const platformMap = {
  linux: "tct-linux",
  win32: "tct-windows.exe",
  darwin: "tct-macos"
};

const binaryName = platformMap[process.platform] || "tct-linux";
const programPath = path.join(__dirname, binaryName);

const DOWNLOAD_URL = `https://github.com/i-tct/tct/releases/latest/download/${binaryName}`;
const CONFIG_TEMPLATE_URL = "https://gist.githubusercontent.com/i-tct/1433de6fbe3a14f2178e5429b46c31c0/raw";

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        return downloadFile(res.headers.location, destPath)
          .then(resolve)
          .catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      }

      const file = fs.createWriteStream(destPath);
      res.pipe(file);

      file.on("finish", () => {
        file.close(() => {
          resolve();
        });
      });

      file.on("error", (err) => {
        fs.unlink(destPath, () => reject(err));
      });
    }).on("error", reject);
  });
}

function downloadBinary() {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(programPath)) {
      const stats = fs.statSync(programPath);
      if (stats.size > 100000) {
        return resolve();
      }
      console.log(`[${BOT_NAME}] Core binary corrupted. Repairing...`);
      fs.unlinkSync(programPath);
    }

    console.log(`[${BOT_NAME}] Initializing engine... downloading from source.`);
    downloadFile(DOWNLOAD_URL, programPath)
      .then(() => {
        try {
          if (process.platform !== "win32") {
            fs.chmodSync(programPath, 0o755);
          }
        } catch {}
        console.log(`[${BOT_NAME}] Engine downloaded successfully.`);
        resolve();
      })
      .catch(reject);
  });
}

async function generateConfig() {
  const candidates = ["TCTfile", "tctfile", "tctfile.yml", "config.yml"];
  let configFile = "tctfile"; 
  let content = "";
  let found = false;

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      configFile = c;
      content = fs.readFileSync(c, "utf8");
      console.log(`[${BOT_NAME}] Configuration detected: ${configFile}`);
      found = true;
      break;
    }
  }

  if (!found) {
    console.log(`[${BOT_NAME}] ⚠️ First-time setup: Fetching default configuration...`);
    try {
      await downloadFile(CONFIG_TEMPLATE_URL, configFile);
      content = fs.readFileSync(configFile, "utf8");
      console.log(`[${BOT_NAME}] ✅ Configuration template ready.`);
    } catch (err) {
      console.error(`[${BOT_NAME}] ❌ Configuration failed:`, err);
    }
  }

  let lines = content ? content.split("\n") : [];

  const forceOverrideEnvVars = (key, value) => {
    if (value === undefined || value === null || value === "") return;

    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const newLine = `${key}: "${escaped}"`;
    const regex = new RegExp(`^${key}\\s*:`, "i");
    let keyFound = false;

    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        lines[i] = newLine; 
        keyFound = true;
        break;
      }
    }

    if (!keyFound) {
      lines.push(newLine); 
    }
  };

  forceOverrideEnvVars("SESSION_ID", process.env.SESSION_ID);
  forceOverrideEnvVars("PREFIX", process.env.PREFIX);
  forceOverrideEnvVars("TIMEZONE", process.env.TIMEZONE);
  forceOverrideEnvVars("OPENWEATHER_API_KEY", process.env.OPENWEATHER_API_KEY);
  forceOverrideEnvVars("POSTGRES_URL", process.env.POSTGRES_URL);
  forceOverrideEnvVars("POSTGRES_SYNC_INTERVAL", process.env.POSTGRES_SYNC_INTERVAL);

  const dynamicPort = process.env.PORT || process.env.server_port || process.env.SERVER_PORT;
  if (dynamicPort) {
    forceOverrideEnvVars("SERVER_PORT", dynamicPort);
  }

  fs.writeFileSync(configFile, lines.join("\n"));
}

let child = null;

async function start() {
  try {
    if (process.platform !== "win32") {
      fs.chmodSync(programPath, 0o755);
    }
  } catch {}

  await generateConfig();

  console.log(`[${BOT_NAME}] System Online. Launching main process...`);

  child = spawn(programPath, [], {
    stdio: "inherit",
    env: process.env 
  });

  child.on("close", (code) => {
    console.log(`[${BOT_NAME}] Process exited with code ${code}`);
    restart();
  });

  child.on("error", (err) => {
    console.error(`[${BOT_NAME}] Failed to start:`, err);
    restart();
  });
}

function restart() {
  console.log(`[${BOT_NAME}] Attempting automatic restart in ${RESTART_DELAY / 1000}s...\n`);
  setTimeout(start, RESTART_DELAY);
}

async function main() {
  try {
    await downloadBinary();
    start();
  } catch (err) {
    console.error(`[${BOT_NAME}] Startup failed:`, err);
    process.exit(1);
  }
}

function shutdown() {
  console.log(`\n[${BOT_NAME}] Powering down...`);
  if (child) {
    child.kill("SIGTERM");
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main();
