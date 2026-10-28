import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootstrap } from "../bootstrap.js";
import { config } from "../config.js";
import { avaliar } from "../evaluation.js";
import { shutdownTelemetry } from "../telemetry.js";

// Avaliação reprodutível: banco em memória e traces separados do painel.
const deps = await bootstrap({ inMemory: true, seed: false, tracesFile: resolve(config.dataDir, "eval-traces.jsonl") });
const r = await avaliar(deps);

const ok = (b: boolean) => (b ? "sim" : "NÃO");
console.log(`\nAvaliação — ${deps.llm.name} (${deps.llm.model}) · embeddings ${deps.embeddings.name}\n`);
console.log("| Caso | Recall@k | Schema | Fundamentado | Sem PII | Cobertura | Top sim. | Passou |");
console.log("|---|---|---|---|---|---|---|---|");
for (const c of r.casos) {
  console.log(`| ${c.id} ${c.descricao} | ${c.recall} | ${ok(c.schemaValido)} | ${ok(c.fundamentado)} | ${ok(c.semPii)} | ${c.cobertura} | ${c.topSimilaridade.toFixed(3)} | ${ok(c.aprovado)} |`);
}
console.log(`\nRecall médio ${r.recallMedio} · schema ${r.schemaValidoPct}% · fundamentado ${r.fundamentadoPct}% · sem PII ${r.semPiiPct}% · cobertura ${r.coberturaMedia}`);
console.log(r.aprovado ? "Resultado: APROVADO" : `Resultado: REPROVADO (limites: ${JSON.stringify(r.limites)})`);

const dir = resolve(config.root, "eval", "resultados");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "latest.json"), JSON.stringify({ geradoEm: new Date().toISOString(), modelo: deps.llm.model, ...r }, null, 2));
await deps.db.close();
await shutdownTelemetry();
process.exit(r.aprovado ? 0 : 1);
