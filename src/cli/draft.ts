import { gerarPreEsboco } from "../agent.js";
import { bootstrap } from "../bootstrap.js";
import { shutdownTelemetry } from "../telemetry.js";
import type { Demanda } from "../types.js";

// Uso: npm run draft -- dem-001
const id = process.argv[2] ?? "dem-001";
const deps = await bootstrap();
const { rows } = await deps.db.query<Demanda>("select * from demandas where id = $1", [id]);
if (!rows.length) {
  console.error(`Demanda ${id} não encontrada.`);
  process.exit(1);
}
const r = await gerarPreEsboco(deps, rows[0]);
console.log(JSON.stringify({ ok: r.ok, preEsbocoId: r.preEsbocoId, traceId: r.traceId, tentativas: r.tentativas, fundamentado: r.fundamentado, usage: r.usage, erros: r.erros }, null, 2));
if (r.preEsboco) console.log(JSON.stringify(r.preEsboco, null, 2));
await deps.db.close();
await shutdownTelemetry();
