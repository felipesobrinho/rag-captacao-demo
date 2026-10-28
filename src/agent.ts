import { randomUUID } from "node:crypto";
import { trace } from "@opentelemetry/api";
import type { Db } from "./db.js";
import type { EmbeddingProvider } from "./embeddings.js";
import { checkGroundedness, findPii, redactPii, validatePreEsboco, type SchemaResult } from "./guardrails.js";
import { costUsd, type LlmProvider, type LlmResponse } from "./llm.js";
import { buildUserPrompt } from "./prompt.js";
import { retrieve } from "./retrieve.js";
import { withSpan } from "./telemetry.js";
import type { Demanda, PreEsboco, RetrievedChunk } from "./types.js";

export interface AgentDeps {
  db: Db;
  embeddings: EmbeddingProvider;
  llm: LlmProvider;
}

export interface ExecucaoResultado {
  ok: boolean;
  preEsbocoId?: string;
  traceId: string;
  preEsboco?: PreEsboco;
  chunks: RetrievedChunk[];
  tentativas: number;
  schemaValidoPrimeira: boolean;
  fundamentado: boolean;
  piiRemovidos: number;
  usage: { inputTokens: number; outputTokens: number; estimated: boolean; costUsd: number };
  erros: string[];
}

async function callModel(llm: LlmProvider, req: Parameters<LlmProvider["generate"]>[0], attempt: number) {
  return withSpan(
    "gen_ai.chat",
    { "gen_ai.system": llm.name, "gen_ai.request.model": llm.model, "gen_ai.operation.name": "chat", "captacao.tentativa": attempt },
    async (span) => {
      const res = await llm.generate(req);
      span.setAttributes({
        "gen_ai.response.model": res.model,
        "gen_ai.usage.input_tokens": res.usage.inputTokens,
        "gen_ai.usage.output_tokens": res.usage.outputTokens,
        "gen_ai.usage.estimated": res.usage.estimated,
        "gen_ai.cost_usd": costUsd(res.usage.inputTokens, res.usage.outputTokens),
      });
      return res;
    },
  );
}

const validate = (output: unknown, attempt: number) =>
  withSpan("guardrail.schema", { "captacao.tentativa": attempt }, async (span): Promise<SchemaResult> => {
    const r = validatePreEsboco(output);
    span.setAttributes({ "guardrail.schema.valid": r.valid, "guardrail.schema.erros": r.errors.slice(0, 10) });
    return r;
  });

/**
 * Pipeline do agente de pré-esboço:
 * PII → busca vetorial → LLM com saída em ferramenta → JSON Schema (com 1 reparo)
 * → fundamentação → grava como rascunho. Cada etapa é um span do OpenTelemetry.
 */
export async function gerarPreEsboco(deps: AgentDeps, demanda: Demanda): Promise<ExecucaoResultado> {
  return withSpan("captacao.pre_esboco", { "captacao.demanda_id": demanda.id }, async (root) => {
    const traceId = root.spanContext().traceId;

    // 1. Guardrail de entrada: dados pessoais não vão para o modelo
    const redacted = await withSpan("guardrail.pii", {}, async (span) => {
      const fields = (["titulo", "descricao", "objetivo"] as const).map((f) => [f, redactPii(demanda[f])] as const);
      const count = fields.reduce((s, [, r]) => s + r.count, 0);
      span.setAttributes({ "guardrail.pii.removidos": count, "guardrail.pii.tipos": [...new Set(fields.flatMap(([, r]) => r.kinds))] });
      return { demanda: { ...demanda, ...Object.fromEntries(fields.map(([f, r]) => [f, r.text])) } as Demanda, count };
    });

    // 2. RAG: só os trechos relevantes da Biblioteca
    const query = `${redacted.demanda.titulo}\n${redacted.demanda.descricao}\n${redacted.demanda.objetivo}`;
    const chunks = await retrieve(deps.db, deps.embeddings, query);
    const user = buildUserPrompt(redacted.demanda, chunks);

    // 3. Modelo + validação, com uma tentativa de reparo
    const usage = { inputTokens: 0, outputTokens: 0, estimated: false };
    const add = (r: LlmResponse) => {
      usage.inputTokens += r.usage.inputTokens;
      usage.outputTokens += r.usage.outputTokens;
      usage.estimated ||= r.usage.estimated;
    };
    let res = await callModel(deps.llm, { user, demanda: redacted.demanda, chunks }, 1);
    add(res);
    let check = await validate(res.output, 1);
    const schemaValidoPrimeira = check.valid;
    let tentativas = 1;
    if (!check.valid) {
      tentativas = 2;
      res = await callModel(
        deps.llm,
        { user, demanda: redacted.demanda, chunks, repair: { previous: res.output, toolUseId: res.toolUseId, errors: check.errors } },
        2,
      );
      add(res);
      check = await validate(res.output, 2);
    }

    const base = {
      traceId,
      chunks,
      tentativas,
      schemaValidoPrimeira,
      piiRemovidos: redacted.count,
      usage: { ...usage, costUsd: costUsd(usage.inputTokens, usage.outputTokens) },
    };
    root.setAttributes({
      "gen_ai.system": deps.llm.name,
      "gen_ai.request.model": deps.llm.model,
      "gen_ai.usage.input_tokens": usage.inputTokens,
      "gen_ai.usage.output_tokens": usage.outputTokens,
      "gen_ai.usage.estimated": usage.estimated,
      "gen_ai.cost_usd": base.usage.costUsd,
      "rag.top_similarity": chunks[0]?.similarity ?? 0,
      "rag.chunk_ids": chunks.map((c) => c.id),
      "captacao.tentativas": tentativas,
      "captacao.schema_valido_1a": schemaValidoPrimeira,
      "guardrail.pii.removidos": redacted.count,
    });

    if (!check.valid) {
      root.setAttributes({ "captacao.resultado": "falha_validacao", "captacao.fundamentado": false });
      return { ...base, ok: false, fundamentado: false, erros: check.errors };
    }

    // 4. Fundamentação: fontes precisam estar entre os trechos recuperados; saída sem PII
    const draft = res.output as PreEsboco;
    const ground = await withSpan("guardrail.fundamentacao", {}, async (span) => {
      const g = checkGroundedness(draft, chunks.map((c) => c.id));
      const pii = findPii(draft);
      span.setAttributes({
        "guardrail.fundamentado": g.grounded,
        "guardrail.fontes_citadas": g.cited,
        "guardrail.fontes_fora_do_contexto": g.notRetrieved,
        "guardrail.pii_na_saida": pii,
      });
      return { ...g, pii };
    });
    const erros = [
      ...ground.notRetrieved.map((id) => `Fonte citada fora do contexto: ${id}`),
      ...ground.pii.map((p) => `Possível dado pessoal na saída: ${p}`),
    ];

    // 5. Persistência: sempre rascunho, nunca aprovado automaticamente
    const preEsbocoId = randomUUID();
    await withSpan("db.salvar_rascunho", { "captacao.pre_esboco_id": preEsbocoId }, async () => {
      await deps.db.query(
        `insert into pre_esbocos (id, demanda_id, status, conteudo, chunk_ids, modelo, trace_id)
         values ($1, $2, 'rascunho', $3, $4, $5, $6)`,
        [preEsbocoId, demanda.id, JSON.stringify(draft), JSON.stringify(chunks.map((c) => c.id)), res.model, traceId],
      );
    });

    root.setAttributes({
      "captacao.resultado": "rascunho_gerado",
      "captacao.pre_esboco_id": preEsbocoId,
      "captacao.fundamentado": ground.grounded && ground.pii.length === 0,
      "captacao.confianca": draft.confianca,
    });
    trace.getActiveSpan()?.addEvent("rascunho_enviado_para_triagem");

    return {
      ...base,
      ok: true,
      preEsbocoId,
      preEsboco: draft,
      fundamentado: ground.grounded && ground.pii.length === 0,
      erros,
    };
  });
}
