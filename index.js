const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

const RESTART_DELAY = 2000;

const platformMap = {
  linux: "tct-linux",
  win32: "tct-windows.exe",
  darwin: "tct-macos"
};

const binaryName = platformMap[process.platform] || "tct-linux";
const programPath = path.join(__dirname, binaryName);

const DOWNLOAD_URL =
  `https://github.com/i-tct/tct/releases/latest/download/${binaryName}`;

function downloadBinary(url = DOWNLOAD_URL) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(programPath)) {
      const stats = fs.statSync(programPath);
      if (stats.size > 100000) {
        return resolve();
      }
      console.log("Binary is corrupted. Re-downloading...");
      fs.unlinkSync(programPath);
    }

    console.log(`Downloading fresh binary from: ${url}`);

    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadBinary(res.headers.location)
          .then(resolve)
          .catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed: ${res.statusCode}`));
      }

      const file = fs.createWriteStream(programPath);
      res.pipe(file);

      file.on("finish", () => {
        file.close(() => {
          try {
            if (process.platform !== "win32") {
              fs.chmodSync(programPath, 0o755);
            }
          } catch {}

          console.log("Binary downloaded successfully.");
          resolve();
        });
      });

      file.on("error", (err) => {
        fs.unlink(programPath, () => reject(err));
      });
    }).on("error", reject);
  });
}

function generateConfig() {
  const candidates = ["TCTfile", "tctfile", "tctfile.yml", "config.yml"];
  let configFile = "tctfile"; 
  let content = "";

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      configFile = c;
      content = fs.readFileSync(c, "utf8");
      console.log(`Detected existing config file: ${configFile}`);
      break;
    }
  }

  let lines = content ? content.split("\n") : [];

  const forceOverrideEnvVars = (key, value) => {
    if (value === undefined || value === null || value === "") return;

    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const newLine = `${key}: "${escaped}"`;
    const regex = new RegExp(`^${key}\\s*:`, "i");
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        lines[i] = newLine; 
        found = true;
        break;
      }
    }

    if (!found) {
      lines.push(newLine); 
    }
  };

  forceOverrideEnvVars("SESSION_ID", process.env.SESSION_ID);
  forceOverrideEnvVars("PREFIX", process.env.PREFIX);
  forceOverrideEnvVars("TIMEZONE", process.env.TIMEZONE);
  forceOverrideEnvVars("OPENWEATHER_API_KEY", process.env.OPENWEATHER_API_KEY);
  
  const dynamicPort = process.env.PORT || process.env.server_port || process.env.SERVER_PORT;
  if (dynamicPort) {
    forceOverrideEnvVars("SERVER_PORT", dynamicPort);
  }

  fs.writeFileSync(configFile, lines.join("\n"));
}

let child = null;

function start() {
  try {
    if (process.platform !== "win32") {
      fs.chmodSync(programPath, 0o755);
    }
  } catch {}

  generateConfig();

  console.log("Starting TCT...");

  child = spawn(programPath, [], {
    stdio: "inherit",
    env: process.env 
  });

  child.on("close", (code) => {
    console.log(`Process exited with code ${code}`);
    restart();
  });

  child.on("error", (err) => {
    console.error("Failed to start:", err);
    restart();
  });
}

function restart() {
  console.log(`Restarting in ${RESTART_DELAY / 1000}s...\n`);
  setTimeout(start, RESTART_DELAY);
}

async function main() {
  try {
    await downloadBinary();
    start();
  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }
}

function shutdown() {
  console.log("\nShutting down...");
  if (child) {
    child.kill("SIGTERM");
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main();
