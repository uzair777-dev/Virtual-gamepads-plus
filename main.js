/**
 * Virtual Gamepads Plus — Main Process Supervisor
 * Pure native Node.js process management & auto-healing supervisor
 */

const child_process = require("child_process");
const path = require("path");
const fs = require("fs");
const log = require("./lib/log");

// 1. Process server arguments & custom port configuration
const serverArgs = ["--https", "--key", "key.pem", "--cert", "cert.pem"];

let customPort = process.env.PORT;
for (let i = 0; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.indexOf("--port=") === 0) {
    customPort = arg.split("=")[1].replace(/"/g, "");
  } else if ((arg === "--port" || arg === "-p") && process.argv[i + 1]) {
    customPort = process.argv[i + 1].replace(/"/g, "");
  }
}

if (customPort) {
  serverArgs.push("--port", customPort.toString());
  process.env.PORT = customPort.toString();
  log("info", "Custom port override configured: " + customPort);
}

// Check for hot reload flag
let isHotReload = Boolean(process.env.HOT_RELOAD);
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === "--hot-reload") {
    isHotReload = true;
  }
}

// 2. System Auto-Heal Recovery Routine
function autoHealSystem() {
  log("warning", "[AUTO-HEAL] Executing system self-recovery routine...");
  try {
    // 1. Ensure uinput kernel module is loaded
    child_process.execSync("modprobe uinput 2>/dev/null || true");
    log("info", "[AUTO-HEAL] Verified uinput kernel module");
  } catch (e) {}

  try {
    // 2. Fix /dev/uinput permissions if restricted
    child_process.execSync("chmod 666 /dev/uinput 2>/dev/null || true");
  } catch (e) {}

  try {
    // 3. Clear any zero-byte or corrupted SSL certs
    const sslDir = path.join(__dirname, "ssl");
    ["key.pem", "cert.pem"].forEach(function(f) {
      const p = path.join(sslDir, f);
      if (fs.existsSync(p) && fs.statSync(p).size === 0) {
        fs.unlinkSync(p);
        log("info", "[AUTO-HEAL] Cleared corrupted 0-byte cert file: " + f);
      }
    });
  } catch (e) {}

  try {
    // 4. Force release stuck network ports
    const ports = [8443, 8080, 8000, 3000, 8081];
    if (customPort && !ports.includes(parseInt(customPort, 10))) {
      ports.push(parseInt(customPort, 10));
    }
    ports.forEach(function(p) {
      child_process.execSync("fuser -k -s " + p + "/tcp 2>/dev/null || true");
    });
    log("info", "[AUTO-HEAL] Released stuck network ports (" + ports.join(", ") + ")");
  } catch (e) {}
}

// 3. Native Child Process Supervisor
const serverScript = path.resolve(__dirname, "server.js");
let child = null;
let exiting = false;
let startTime = 0;
let earlyDeathCount = 0;
let restartCount = 0;
let restartTimer = null;

function startServer() {
  if (exiting) return;

  startTime = Date.now();

  // Fork server.js as child process with inherited stdio
  child = child_process.fork(serverScript, serverArgs, {
    stdio: "inherit",
    env: process.env
  });

  child.on("exit", function(code, signal) {
    child = null;
    if (exiting) return;

    const diedAfter = Date.now() - startTime;
    log("warning", "server.js has exited with code " + code + (signal ? " (" + signal + ")" : ""));
    log("info", "diedAfter: " + diedAfter + "ms");

    earlyDeathCount = diedAfter < 5000 ? earlyDeathCount + 1 : 0;
    log("info", "earlyDeathCount: " + earlyDeathCount);

    if (earlyDeathCount >= 3) {
      log("warning", "[AUTO-HEAL] Crash loop detected. Triggering auto-heal recovery...");
      autoHealSystem();
      earlyDeathCount = 0;
    }

    restartCount++;
    log("info", "Restarting server.js (restart #" + restartCount + ")...");

    // Add brief backoff delay before restarting if crashing rapidly
    const delay = earlyDeathCount > 0 ? 1000 : 250;
    restartTimer = setTimeout(function() {
      if (!exiting) {
        startServer();
      }
    }, delay);
  });

  child.on("error", function(err) {
    log("error", "Failed to start server child process: " + err.message);
  });
}

// 4. Hot Reload File Watcher (Native fs.watch)
let watcher = null;
if (isHotReload) {
  log("info", "Hot reload is ENABLED (watching for file changes)");
  let debounceTimer = null;

  const watchIgnored = (filename) => {
    if (!filename) return false;
    const normalized = filename.replace(/\\/g, "/");
    return (
      normalized.startsWith(".git") ||
      normalized.startsWith("node_modules") ||
      normalized.startsWith("presets") ||
      normalized.startsWith("ssl") ||
      normalized.includes(".vgp_qrcode") ||
      normalized.endsWith("~") ||
      normalized.startsWith(".#")
    );
  };

  try {
    watcher = fs.watch(__dirname, { recursive: true }, function(eventType, filename) {
      if (exiting || !filename || watchIgnored(filename)) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function() {
        log("info", "[HOT-RELOAD] File change detected: " + filename + ". Reloading server...");
        if (child) {
          // Kill current child; the exit handler will automatically spawn a fresh instance
          try {
            child.kill("SIGTERM");
          } catch (e) {}
        } else if (!restartTimer) {
          startServer();
        }
      }, 300);
    });
  } catch (err) {
    log("warning", "Could not initialize recursive file watcher for hot reload: " + err.message);
  }
}

// 5. Graceful Signal Shutdown Handlers
const signals = ["SIGTERM", "SIGINT", "SIGHUP"];
signals.forEach(function(sig) {
  process.on(sig, function() {
    if (exiting) return;
    exiting = true;

    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }

    if (watcher) {
      try {
        watcher.close();
      } catch (e) {}
    }

    log("info", "Main process received signal " + sig + ", stopping server...");

    if (child) {
      try {
        child.kill(sig);
      } catch (e) {
        log("error", e.message);
      }
    }

    setTimeout(function() {
      const targetPort = process.env.PORT || 8443;
      try {
        child_process.execSync("fuser -k -s " + targetPort + "/tcp 8443/tcp 8080/tcp 2>/dev/null || true");
      } catch (e) {}
      process.exit(0);
    }, 350);
  });
});

// Launch server
startServer();
