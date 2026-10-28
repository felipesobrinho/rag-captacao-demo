import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, resolve, normalize } from "node:path";
import { randomUUID } from "node:crypto";
import { gerarPreEsboco } from "./agent.js";
import { bootstrap } from "./bootstrap.js";
import { config } from "./config.js";
import { saveDemanda } from "./ingest.js";
import { calcularMetricas, semanaIso } from "./metrics.js";
import { readSpanRecords, type SpanRecord } from "./telemetry.js";
import { listarTriagens, registrarTriagem } from "./triage.js";
import type { Decisao, Demanda } from "./types.js";

const deps = await bootstrap();
const publicDir = resolve(config.root, "public");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

async function readBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.length > 50_000) throw new Error("Corpo muito grande");
  return (raw ? JSON.parse(raw) : {}) as T;
}

function execucoes(limit = 20) {
  const spans = readSpanRecords();
  const byTrace = new Map<string, SpanRecord[]>();
  for (const s of spans) byTrace.set(s.traceId, [...(byTrace.get(s.traceId) ?? []), s]);
  return spans
    .filter((s) => s.name === "captacao.pre_esboco")
    .slice(-limit)
    .reverse()
    .map((root) => ({
      ...root,
      spans: [root, ...(byTrace.get(root.traceId) ?? []).filter((s) => s !== root && s.spanId !== root.spanId).sort((a, b) => a.start.localeCompare(b.start))],
    }));
}

async function chunksByIds(ids: string[]) {
  if (!ids.length) return [];
  const { rows } = await deps.db.query<{ id: string; documento_id: string; titulo: string; secao: string; conteudo: string }>(
    `select c.id, c.documento_id, d.titulo, c.secao, c.conteudo
     from chunks c join documentos d on d.id = c.documento_id where c.id = any($1::text[])`,
    [ids],
  );
  return ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const m = (re: RegExp) => path.match(re);

  if (req.method === "GET" && path === "/api/estado") {
    return send(res, 200, { llm: { provider: deps.llm.name, model: deps.llm.model }, embeddings: deps.embeddings.name, banco: deps.db.kind });
  }

  if (req.method === "GET" && path === "/api/demandas") {
    const { rows } = await deps.db.query(
      `select d.*, p.id as pre_esboco_id, p.status as pre_esboco_status
       from demandas d
       left join lateral (select id, status from pre_esbocos where demanda_id = d.id order by criado_em desc limit 1) p on true
       order by d.criado_em, d.id`,
    );
    return send(res, 200, rows);
  }

  if (req.method === "POST" && path === "/api/demandas") {
    const body = await readBody<Partial<Demanda>>(req);
    for (const f of ["titulo", "setor", "descricao", "objetivo"] as const) {
      if (!body[f] || String(body[f]).trim().length < 3) return send(res, 400, { erro: `Campo obrigatório: ${f}` });
    }
    const demanda: Demanda = {
      id: `dem-${randomUUID().slice(0, 8)}`,
      titulo: String(body.titulo).slice(0, 120),
      setor: String(body.setor).slice(0, 80),
      descricao: String(body.descricao).slice(0, 2000),
      objetivo: String(body.objetivo).slice(0, 600),
      prazo_desejado: body.prazo_desejado ? String(body.prazo_desejado).slice(0, 80) : null,
    };
    await saveDemanda(deps.db, demanda);
    return send(res, 201, demanda);
  }

  let match = m(/^\/api\/demandas\/([\w-]+)\/pre-esboco$/);
  if (req.method === "POST" && match) {
    const { rows } = await deps.db.query<Demanda>("select * from demandas where id = $1", [match[1]]);
    if (!rows.length) return send(res, 404, { erro: "Demanda não encontrada" });
    const r = await gerarPreEsboco(deps, rows[0]);
    const exec = execucoes(50).find((e) => e.traceId === r.traceId);
    return send(res, 200, { ...r, execucao: exec });
  }

  match = m(/^\/api\/pre-esbocos\/([\w-]+)$/);
  if (req.method === "GET" && match) {
    const { rows } = await deps.db.query<{ chunk_ids: string[]; trace_id: string }>("select * from pre_esbocos where id = $1", [match[1]]);
    if (!rows.length) return send(res, 404, { erro: "Pré-esboço não encontrado" });
    const exec = execucoes(500).find((e) => e.traceId === rows[0].trace_id);
    return send(res, 200, { ...rows[0], chunks: await chunksByIds(rows[0].chunk_ids), execucao: exec });
  }

  match = m(/^\/api\/pre-esbocos\/([\w-]+)\/triagem$/);
  if (req.method === "POST" && match) {
    const body = await readBody<{ decisao: Decisao; nota?: string }>(req);
    return send(res, 200, await registrarTriagem(deps.db, match[1], body.decisao, body.nota));
  }

  if (req.method === "GET" && path === "/api/execucoes") return send(res, 200, execucoes());

  if (req.method === "GET" && path === "/api/metricas") {
    const ref = url.searchParams.get("semana");
    return send(res, 200, calcularMetricas(readSpanRecords(), await listarTriagens(deps.db), semanaIso(ref ? new Date(ref) : new Date())));
  }

  // estáticos
  const file = normalize(resolve(publicDir, path === "/" ? "index.html" : `.${path}`));
  if (file.startsWith(publicDir) && existsSync(file)) {
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    return res.end(readFileSync(file));
  }
  send(res, 404, { erro: "Não encontrado" });
}

createServer((req, res) => {
  route(req, res).catch((error: Error) => send(res, 500, { erro: error.message }));
}).listen(config.port, "127.0.0.1", () => {
  console.log(`Captação demo em http://localhost:${config.port}  ·  LLM ${deps.llm.name} (${deps.llm.model})  ·  banco ${deps.db.kind}`);
});
