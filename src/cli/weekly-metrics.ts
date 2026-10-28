import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../config.js";
import { openDb } from "../db.js";
import { calcularMetricas, renderMarkdown, semanaIso } from "../metrics.js";
import { readSpanRecords } from "../telemetry.js";
import { listarTriagens } from "../triage.js";

// Uso: npm run metricas:semana [-- 2026-10-26]   (qualquer data da semana desejada)
const ref = process.argv[2] ? new Date(process.argv[2]) : new Date();
const periodo = semanaIso(ref);
const db = await openDb();
const metricas = calcularMetricas(readSpanRecords(), await listarTriagens(db), periodo);
await db.close();

const markdown = renderMarkdown(metricas);
const dir = resolve(config.root, "reports");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, `metricas-${periodo.rotulo}.md`), markdown);
writeFileSync(resolve(dir, `metricas-${periodo.rotulo}.json`), JSON.stringify(metricas, null, 2));
console.log(markdown);

// Opcional: publica um resumo no canal da equipe (webhook de entrada do Teams)
if (config.teamsWebhookUrl) {
  const res = await fetch(config.teamsWebhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: markdown }),
  });
  console.log(`Teams: HTTP ${res.status}`);
}
