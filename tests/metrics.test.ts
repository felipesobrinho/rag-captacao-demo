import { describe, expect, it } from "vitest";
import { calcularMetricas, renderMarkdown, semanaIso } from "../src/metrics.js";
import type { SpanRecord } from "../src/telemetry.js";

const root = (start: string, ms: number, attrs: Record<string, unknown>): SpanRecord => ({
  traceId: Math.random().toString(16).slice(2),
  spanId: "s",
  parentSpanId: null,
  name: "captacao.pre_esboco",
  start,
  durationMs: ms,
  status: "OK",
  attributes: attrs as SpanRecord["attributes"],
});

describe("métricas semanais", () => {
  it("calcula a semana ISO", () => {
    const p = semanaIso(new Date("2026-10-28T12:00:00Z"));
    expect(p.rotulo).toBe("2026-W44");
    expect(p.inicio.toISOString().slice(0, 10)).toBe("2026-10-26");
  });

  it("consolida execuções, custo, latência e triagem do período", () => {
    const base = { "gen_ai.usage.input_tokens": 1000, "gen_ai.usage.output_tokens": 500, "gen_ai.cost_usd": 0.0105, "rag.top_similarity": 0.5 };
    const spans = [
      root("2026-10-26T10:00:00Z", 1000, { ...base, "captacao.resultado": "rascunho_gerado", "captacao.schema_valido_1a": true, "captacao.fundamentado": true }),
      root("2026-10-27T10:00:00Z", 3000, { ...base, "captacao.resultado": "rascunho_gerado", "captacao.schema_valido_1a": false, "captacao.fundamentado": true }),
      root("2026-10-28T10:00:00Z", 2000, { ...base, "captacao.resultado": "falha_validacao", "captacao.schema_valido_1a": false }),
      root("2026-10-19T10:00:00Z", 9000, { ...base, "captacao.resultado": "rascunho_gerado" }), // semana anterior
    ];
    const triagens = [
      { pre_esboco_id: "a", decisao: "aprovado" as const, decidido_em: "2026-10-26T11:00:00Z" },
      { pre_esboco_id: "b", decisao: "ajustes" as const, decidido_em: "2026-10-27T11:00:00Z" },
      { pre_esboco_id: "b", decisao: "aprovado" as const, decidido_em: "2026-10-28T11:00:00Z" },
    ];
    const m = calcularMetricas(spans, triagens, semanaIso(new Date("2026-10-28")));
    expect(m.execucoes).toBe(3);
    expect(m.rascunhosGerados).toBe(2);
    expect(m.falhasValidacao).toBe(1);
    expect(m.schemaValidoPrimeiraPct).toBe(33.3);
    expect(m.latenciaMs).toEqual({ media: 2000, p50: 2000, p95: 3000 });
    expect(m.tokens.entrada).toBe(3000);
    expect(m.custoUsd.total).toBeCloseTo(0.0315, 4);
    expect(m.triagem).toMatchObject({ total: 2, aprovados: 1, ajustes: 1, aceitosSemRetrabalhoPct: 50 });
    expect(renderMarkdown(m)).toContain("| Aceitos sem retrabalho | 50%");
  });
});
