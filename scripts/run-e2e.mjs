import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const port = 3107;
const baseUrl = `http://localhost:${port}`;
const node = process.execPath;
const nextBin = new URL("../node_modules/next/dist/bin/next", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1));
const playwrightBin = new URL("../node_modules/@playwright/test/cli.js", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1));
const server = spawn(node, [nextBin, "dev", "-p", String(port)], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

server.stdout.on("data", (chunk) => process.stdout.write(`[web] ${chunk}`));
server.stderr.on("data", (chunk) => process.stderr.write(`[web] ${chunk}`));

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Le serveur est encore en démarrage.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Le serveur E2E n’a pas démarré dans le délai prévu.");
}

function stopServer() {
  if (!server.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else {
    server.kill("SIGTERM");
  }
}

let exitCode = 1;
try {
  await waitForServer();
  exitCode = await new Promise((resolve) => {
    const runner = spawn(node, [playwrightBin, "test"], {
      cwd: process.cwd(),
      stdio: "inherit",
      windowsHide: true,
      env: { ...process.env, PLAYWRIGHT_BASE_URL: baseUrl },
    });
    runner.on("exit", (code) => resolve(code ?? 1));
    runner.on("error", () => resolve(1));
  });
} finally {
  stopServer();
}
process.exit(exitCode);
