import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gerarPreEsboco, type AgentDeps } from "../src/agent.js";
import { bootstrap } from "../src/bootstrap.js";
import { avaliar } from "../src/evaluation.js";
import { readSpanRecords, shutdownTelemetry } from "../src/telemetry.js";
import { registrarTriagem } from "../src/triage.js";
import type { Demanda } from "../src/types.js";

const tracesFile = join(mkdtempSync(join(tmpdir(), "captacao-")), "traces.jsonl");
let deps: AgentDeps;

beforeAll(async () => {
  deps = await bootstrap({ inMemory: true, tracesFile });
});

afterAll(async () => {
  await deps.db.close();
  await shutdownTelemetry();
});

const demanda = async (id: string) => (await deps.db.query<Demanda>("select * from demandas where id = $1", [id])).rows[0];

describe("pipeline de pré-esboço (PGlite + pgvector + gerador offline)", () => {
  it("indexa a Biblioteca e as demandas de exemplo", async () => {
    const docs = await deps.db.query<{ n: number }>("select count(*)::int as n from documentos");
    const chunks = await deps.db.query<{ n: number }>("select count(*)::int as n from chunks");
    expect(docs.rows[0].n).toBe(8);
    expect(chunks.rows[0].n).toBeGreaterThan(40);
  });

  it("gera um rascunho válido, fundamentado e sem dados pessoais", async () => {
    const r = await gerarPreEsboco(deps, await demanda("dem-001"));
    expect(r.ok).toBe(true);
    expect(r.preEsboco?.status).toBe("rascunho");
    expect(r.fundamentado).toBe(true);
    expect(r.piiRemovidos).toBe(2);
    expect(JSON.stringify(r.preEsboco)).not.toContain("@exemplo.com");
    expect(r.chunks[0].documento_id).toBe("proj-001-reserva-espacos");
    const saved = await deps.db.query<{ status: string }>("select status from pre_esbocos where id = $1", [r.preEsbocoId]);
    expect(saved.rows[0].status).toBe("rascunho");
  });

  it("registra um trace com as etapas e os atributos de custo e RAG", async () => {
    const r = await gerarPreEsboco(deps, await demanda("dem-002"));
    const spans = readSpanRecords(tracesFile).filter((s) => s.traceId === r.traceId);
    expect(spans.map((s) => s.name).sort()).toEqual(
      ["captacao.pre_esboco", "db.salvar_rascunho", "gen_ai.chat", "guardrail.fundamentacao", "guardrail.pii", "guardrail.schema", "rag.retrieve"].sort(),
    );
    const root = spans.find((s) => s.name === "captacao.pre_esboco")!;
    expect(root.attributes["gen_ai.usage.input_tokens"]).toBeGreaterThan(0);
    expect(root.attributes["gen_ai.cost_usd"]).toBeGreaterThan(0);
    expect(root.attributes["rag.chunk_ids"]).toEqual(r.chunks.map((c) => c.id));
    expect(readFileSync(tracesFile, "utf8").length).toBeGreaterThan(0);
  });

  it("repara uma saída inválida com uma segunda chamada", async () => {
    process.env.OFFLINE_FAIL_FIRST = "1";
    try {
      const r = await gerarPreEsboco(deps, await demanda("dem-003"));
      expect(r.ok).toBe(true);
      expect(r.tentativas).toBe(2);
      expect(r.schemaValidoPrimeira).toBe(false);
    } finally {
      delete process.env.OFFLINE_FAIL_FIRST;
    }
  });

  it("a decisão humana muda o status; o agente nunca aprova sozinho", async () => {
    const r = await gerarPreEsboco(deps, await demanda("dem-004"));
    await registrarTriagem(deps.db, r.preEsbocoId!, "ajustes", "Detalhar o público");
    const row = await deps.db.query<{ status: string }>("select status from pre_esbocos where id = $1", [r.preEsbocoId]);
    expect(row.rows[0].status).toBe("ajustes");
    await expect(registrarTriagem(deps.db, r.preEsbocoId!, "auto" as never)).rejects.toThrow();
  });

  it("passa no conjunto de avaliação", async () => {
    const resumo = await avaliar(deps);
    expect(resumo.aprovado).toBe(true);
    expect(resumo.recallMedio).toBe(1);
  });
});
