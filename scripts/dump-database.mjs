import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  throw new Error("SUPABASE_DB_URL est requis.");
}

const reports = resolve(process.cwd(), "reports", "portable-export", "database");
mkdirSync(reports, { recursive: true });
const output = resolve(reports, "sunushop.sql");
const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  executable,
  [
    "supabase",
    "db",
    "dump",
    "--db-url",
    databaseUrl,
    "--file",
    output,
    "--use-copy",
  ],
  { stdio: "inherit" },
);
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
process.stdout.write(`Dump PostgreSQL créé dans ${output}.\n`);
