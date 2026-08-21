#!/usr/bin/env node
// Harnais de charge/stress/endurance sans dépendance externe (pas de k6,
// autocannon, artillery installés — voir audit backend 2026-08).
//
// Contrainte du projet : les tests tournent contre le Supabase CLOUD (pas
// de Docker local disponible), donc toute donnée créée doit être traçable
// et purgeable. Convention obligatoire : préfixer `loadtest-<runId>` tout
// email / nom / dedupeKey créé par un scénario, pour que cleanup.mjs puisse
// tout retrouver et supprimer sans ambiguïté.
//
// Usage :
//   node scripts/loadtest/runner.mjs --scenario=charge --route=/api/storefront --rps=5 --duration=30
//   node scripts/loadtest/runner.mjs --scenario=stress --route=/api/catalog --start-rps=2 --max-rps=40 --step-seconds=10
//   node scripts/loadtest/runner.mjs --scenario=endurance --route=/api/search?query=riz --rps=3 --duration=600

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const match = /^--([^=]+)=?(.*)$/.exec(raw);
    if (!match) continue;
    const [, key, value] = match;
    args[key] = value === "" ? true : value;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const baseUrl = (args["base-url"] || process.env.LOADTEST_BASE_URL || "http://127.0.0.1:3107").replace(/\/$/, "");
const scenario = args.scenario || "charge";
const route = args.route || "/api/health";
const method = (args.method || "GET").toUpperCase();
const runId = args["run-id"] || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Garde-fou obligatoire : arrêt automatique si le taux de 5xx dérape.
// Sur une base partagée (cloud), on préfère sous-tester que dégrader le
// service pour de vrais utilisateurs futurs ou saturer le quota Supabase.
const ERROR_RATE_ABORT_THRESHOLD = Number(args["error-threshold"] || 0.25);
const ERROR_RATE_MIN_SAMPLES = 20;
const MAX_RPS_HARD_CAP = Number(args["hard-cap-rps"] || 60);

function now() {
  return process.hrtime.bigint();
}
function msSince(start) {
  return Number(now() - start) / 1_000_000;
}

async function fireOne(url, requestInit) {
  const start = now();
  try {
    const response = await fetch(url, { ...requestInit, signal: AbortSignal.timeout(15_000) });
    const latencyMs = msSince(start);
    // On draine le corps pour mesurer le coût réel (parsing inclus côté
    // client), sans le garder en mémoire au-delà de cette itération.
    await response.arrayBuffer().catch(() => undefined);
    return { ok: response.ok, status: response.status, latencyMs };
  } catch (error) {
    return { ok: false, status: 0, latencyMs: msSince(start), error: error instanceof Error ? error.message : String(error) };
  }
}

function percentile(sortedLatencies, p) {
  if (!sortedLatencies.length) return 0;
  const index = Math.min(sortedLatencies.length - 1, Math.floor((p / 100) * sortedLatencies.length));
  return sortedLatencies[index];
}

function summarize(samples) {
  const latencies = samples.map((s) => s.latencyMs).sort((a, b) => a - b);
  const errors = samples.filter((s) => !s.ok);
  const statusCounts = {};
  for (const s of samples) statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1;
  return {
    count: samples.length,
    errorCount: errors.length,
    errorRate: samples.length ? errors.length / samples.length : 0,
    p50: Math.round(percentile(latencies, 50)),
    p95: Math.round(percentile(latencies, 95)),
    p99: Math.round(percentile(latencies, 99)),
    max: latencies.length ? Math.round(latencies[latencies.length - 1]) : 0,
    statusCounts,
  };
}

// Une "vague" envoie `rps` requêtes espacées sur 1 seconde puis attend la fin.
async function runWave(url, requestInit, rps) {
  const promises = [];
  const intervalMs = 1000 / Math.max(1, rps);
  for (let i = 0; i < rps; i++) {
    promises.push(
      new Promise((resolve) => {
        setTimeout(() => resolve(fireOne(url, requestInit)), Math.round(i * intervalMs));
      }),
    );
  }
  return Promise.all(promises);
}

function checkAbort(samples) {
  if (samples.length < ERROR_RATE_MIN_SAMPLES) return false;
  const recent = samples.slice(-ERROR_RATE_MIN_SAMPLES);
  const errorRate = recent.filter((s) => !s.ok).length / recent.length;
  return errorRate >= ERROR_RATE_ABORT_THRESHOLD;
}

async function runCharge() {
  const rps = Math.min(MAX_RPS_HARD_CAP, Number(args.rps || 5));
  const durationSeconds = Number(args.duration || 30);
  const url = `${baseUrl}${route}`;
  const requestInit = { method };
  const samples = [];
  console.log(`[charge] ${url} rps=${rps} duration=${durationSeconds}s runId=${runId}`);
  for (let second = 0; second < durationSeconds; second++) {
    const wave = await runWave(url, requestInit, rps);
    samples.push(...wave);
    if (checkAbort(samples)) {
      console.error(`[charge] ABORT à t=${second}s : taux d'erreur >= ${ERROR_RATE_ABORT_THRESHOLD * 100}% sur les dernières requêtes`);
      break;
    }
  }
  return { scenario: "charge", rps, durationSeconds, samples };
}

async function runStress() {
  const startRps = Number(args["start-rps"] || 2);
  const maxRps = Math.min(MAX_RPS_HARD_CAP, Number(args["max-rps"] || 40));
  const stepSeconds = Number(args["step-seconds"] || 10);
  const url = `${baseUrl}${route}`;
  const requestInit = { method };
  const samples = [];
  const steps = [];
  console.log(`[stress] ${url} startRps=${startRps} maxRps=${maxRps} stepSeconds=${stepSeconds} runId=${runId}`);
  let rps = startRps;
  let brokenAt = null;
  while (rps <= maxRps) {
    const stepSamples = [];
    for (let second = 0; second < stepSeconds; second++) {
      const wave = await runWave(url, requestInit, rps);
      stepSamples.push(...wave);
      samples.push(...wave);
    }
    const stepSummary = summarize(stepSamples);
    steps.push({ rps, ...stepSummary });
    console.log(`[stress] rps=${rps} p95=${stepSummary.p95}ms errorRate=${(stepSummary.errorRate * 100).toFixed(1)}%`);
    if (checkAbort(samples)) {
      brokenAt = rps;
      console.error(`[stress] point de rupture atteint à rps=${rps}`);
      break;
    }
    rps += Math.max(1, Math.round(startRps));
  }
  return { scenario: "stress", startRps, maxRps, stepSeconds, brokenAtRps: brokenAt, steps, samples };
}

async function runEndurance() {
  const rps = Math.min(MAX_RPS_HARD_CAP, Number(args.rps || 3));
  const durationSeconds = Number(args.duration || 600);
  const url = `${baseUrl}${route}`;
  const requestInit = { method };
  const samples = [];
  const checkpoints = [];
  console.log(`[endurance] ${url} rps=${rps} duration=${durationSeconds}s runId=${runId}`);
  const checkpointEverySeconds = 60;
  let sinceCheckpoint = [];
  for (let second = 0; second < durationSeconds; second++) {
    const wave = await runWave(url, requestInit, rps);
    samples.push(...wave);
    sinceCheckpoint.push(...wave);
    if ((second + 1) % checkpointEverySeconds === 0) {
      const summary = summarize(sinceCheckpoint);
      checkpoints.push({ atSecond: second + 1, ...summary });
      console.log(`[endurance] t=${second + 1}s p95=${summary.p95}ms errorRate=${(summary.errorRate * 100).toFixed(1)}%`);
      sinceCheckpoint = [];
    }
    if (checkAbort(samples)) {
      console.error(`[endurance] ABORT à t=${second}s : taux d'erreur >= ${ERROR_RATE_ABORT_THRESHOLD * 100}%`);
      break;
    }
  }
  // Dérive de latence : compare le premier et le dernier checkpoint pour
  // repérer une fuite/dégradation progressive (p95 qui grimpe dans le temps
  // à charge constante).
  const drift = checkpoints.length >= 2
    ? checkpoints[checkpoints.length - 1].p95 - checkpoints[0].p95
    : null;
  return { scenario: "endurance", rps, durationSeconds, checkpoints, p95DriftMs: drift, samples };
}

async function main() {
  if (rpsExceedsCap()) {
    console.error(`Refus : rps demandé dépasse le plafond dur (${MAX_RPS_HARD_CAP}). Passez --hard-cap-rps si c'est volontaire.`);
    process.exit(1);
  }

  let result;
  if (scenario === "charge") result = await runCharge();
  else if (scenario === "stress") result = await runStress();
  else if (scenario === "endurance") result = await runEndurance();
  else {
    console.error(`Scénario inconnu: ${scenario} (charge|stress|endurance)`);
    process.exit(1);
  }

  const summary = summarize(result.samples);
  const report = {
    runId,
    baseUrl,
    route,
    method,
    ranAt: new Date().toISOString(),
    ...result,
    samples: undefined, // exclu du JSON écrit (volumineux) ; le résumé suffit
    summary,
  };

  const reportsDir = join(process.cwd(), "reports", "loadtest");
  mkdirSync(reportsDir, { recursive: true });
  const reportPath = join(reportsDir, `${scenario}-${runId}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("\n=== Résumé ===");
  console.log(`Requêtes: ${summary.count}  Erreurs: ${summary.errorCount} (${(summary.errorRate * 100).toFixed(1)}%)`);
  console.log(`Latence p50=${summary.p50}ms p95=${summary.p95}ms p99=${summary.p99}ms max=${summary.max}ms`);
  console.log(`Statuts: ${JSON.stringify(summary.statusCounts)}`);
  console.log(`Rapport: ${reportPath}`);
  if (result.scenario === "stress" && result.brokenAtRps) {
    console.log(`Point de rupture: ~${result.brokenAtRps} req/s`);
  }
  if (result.scenario === "endurance" && result.p95DriftMs !== null) {
    console.log(`Dérive p95 (premier → dernier checkpoint): ${result.p95DriftMs >= 0 ? "+" : ""}${result.p95DriftMs}ms`);
  }
}

function rpsExceedsCap() {
  const candidates = [args.rps, args["max-rps"], args["start-rps"]].map(Number).filter((n) => !Number.isNaN(n));
  return candidates.some((n) => n > MAX_RPS_HARD_CAP);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
