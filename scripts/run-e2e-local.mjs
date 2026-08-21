import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const isWindows = process.platform === "win32";
const dockerDesktop = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";
const supabaseCli = fileURLToPath(new URL("../node_modules/supabase/dist/supabase.js", import.meta.url));
const playwrightCli = fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url));
const nextCli = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const keepLocal = process.argv.includes("--keep-local");
const playwrightArgs = process.argv.slice(2).filter((arg) => arg !== "--keep-local");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} a échoué (${result.status}).`);
}

function output(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: false, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `${command} a échoué.`);
  return result.stdout;
}

function dockerReady() {
  return spawnSync("docker", ["info"], { stdio: "ignore", shell: false }).status === 0;
}

async function ensureDocker() {
  if (dockerReady()) return;
  if (!isWindows) throw new Error("Docker doit être démarré avant les E2E.");
  const child = spawn(dockerDesktop, [], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    if (dockerReady()) return;
  }
  throw new Error("Docker Desktop ne répond pas après 120 secondes.");
}

function parseSupabaseEnv(raw) {
  return Object.fromEntries(raw.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(?:"([^"]*)"|(.*))$/);
    return match ? [[match[1], match[2] ?? match[3] ?? ""]] : [];
  }));
}

async function waitForSupabaseReady(apiUrl, anonKey) {
  const deadline = Date.now() + 90_000;
  let consecutiveSuccesses = 0;
  while (Date.now() < deadline) {
    try {
      const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
      const [auth, rest, storage] = await Promise.all([
        fetch(`${apiUrl}/auth/v1/health`, { headers }),
        fetch(`${apiUrl}/rest/v1/`, { headers }),
        fetch(`${apiUrl}/storage/v1/bucket`, { headers }),
      ]);
      consecutiveSuccesses = auth.ok && rest.ok && storage.ok ? consecutiveSuccesses + 1 : 0;
      if (consecutiveSuccesses >= 3) return;
    } catch {
      consecutiveSuccesses = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("La pile Supabase locale n'est pas devenue stable après le reset.");
}

let started = false;
let succeeded = false;
try {
  await ensureDocker();
  // La sortie de `supabase start` contient les clés locales : elles sont
  // consommées par le runner mais ne doivent pas être recopiées dans les logs.
  output(process.execPath, [supabaseCli, "start"]);
  started = true;
  run(process.execPath, [supabaseCli, "db", "reset", "--local"]);
  let local = parseSupabaseEnv(output(process.execPath, [supabaseCli, "status", "-o", "env"]));
  let apiUrl = local.API_URL;
  if (!apiUrl || !["127.0.0.1", "localhost", "::1"].includes(new URL(apiUrl).hostname)) {
    throw new Error(`La pile Supabase locale n'a pas fourni une URL sûre (${apiUrl ?? "absente"}).`);
  }
  try {
    await waitForSupabaseReady(apiUrl, local.ANON_KEY);
  } catch {
    console.error("Supabase Auth local est instable : reconstruction complète de la pile jetable.");
    run(process.execPath, [supabaseCli, "stop", "--no-backup"]);
    output(process.execPath, [supabaseCli, "start"]);
    run(process.execPath, [supabaseCli, "db", "reset", "--local"]);
    local = parseSupabaseEnv(output(process.execPath, [supabaseCli, "status", "-o", "env"]));
    apiUrl = local.API_URL;
    if (!apiUrl || !["127.0.0.1", "localhost", "::1"].includes(new URL(apiUrl).hostname)) {
      throw new Error("La pile Supabase reconstruite n'a pas fourni une URL loopback sûre.");
    }
    await waitForSupabaseReady(apiUrl, local.ANON_KEY);
  }
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3107",
    DELIVERY_CODE_SECRET: "e2e-local-delivery-code-secret-32-chars",
    RATE_LIMIT_HASH_SECRET: "e2e-local-rate-limit-secret-32-chars",
    SUNUSHOP_E2E_LOCAL_RESET: "1",
    SUNUSHOP_E2E_PRODUCTION_SERVER: "1",
    SUNUSHOP_E2E_RUN_ID: `run-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}-${crypto.randomUUID().slice(0, 8)}`,
  };
  run(process.execPath, [nextCli, "build", "--webpack"], { env });
  run(process.execPath, [playwrightCli, "test", ...playwrightArgs], { env });
  succeeded = true;
} finally {
  if (started && !keepLocal && succeeded) {
    spawnSync(process.execPath, [supabaseCli, "stop", "--no-backup"], { stdio: "inherit", shell: false });
  } else if (started && !keepLocal && !succeeded) {
    console.error("Le run a échoué : la pile Supabase locale est conservée pour le diagnostic.");
  }
}
