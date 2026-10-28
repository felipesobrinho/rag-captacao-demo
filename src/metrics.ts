import type { SpanRecord } from "./telemetry.js";
import type { TriagemRow } from "./triage.js";

export interface Periodo {
  inicio: Date;
  fim: Date;
  rotulo: string;
}

/** Semana ISO (segunda a domingo, UTC) que contém a data. */
export function semanaIso(ref = new Date()): Periodo {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const dia = d.getUTCDay() || 7;
  const inicio = new Date(d);
  inicio.setUTCDate(d.getUTCDate() - dia + 1);
  const fim = new Date(inicio);
  fim.setUTCDate(inicio.getUTCDate() + 7);
  const quinta = new Date(d);
  quinta.setUTCDate(d.getUTCDate() + 4 - dia);
  const anoIso = quinta.getUTCFullYear();
  const semana = Math.ceil(((quinta.getTime() - Date.UTC(anoIso, 0, 1)) / 86_400_000 + 1) / 7);
  return { inicio, fim, rotulo: `${anoIso}-W${String(semana).padStart(2, "0")}` };
}

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
};
const avg = (values: number[]) => (values.length ? values.reduce((s, x) => s + x, 0) / values.length : 0);
const pct = (part: number, total: number) => (total ? Math.round((part / total) * 1000) / 10 : 0);
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

export interface MetricasSemana {
  periodo: string;
  inicio: string;
  fim: string;
  execucoes: number;
  rascunhosGerados: number;
  falhasValidacao: number;
  schemaValidoPrimeiraPct: number;
  fundamentadosPct: number;
  latenciaMs: { media: number; p50: number; p95: number };
  tokens: { entrada: number; saida: number; estimados: boolean };
  custoUsd: { total: number; medioPorExecucao: number };
  similaridadeTopMedia: number;
  piiRemovidos: number;
  triagem: { total: number; aprovados: number; ajustes: number; recusados: number; aceitosSemRetrabalhoPct: number };
}

/** Consolida os spans do OpenTelemetry e as decisões de triagem de um período. */
export function calcularMetricas(spans: SpanRecord[], triagens: TriagemRow[], periodo: Periodo): MetricasSemana {
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= periodo.inicio.getTime() && t < periodo.fim.getTime();
  };
  const runs = spans.filter((s) => s.name === "captacao.pre_esboco" && inRange(s.start));
  const ok = runs.filter((r) => r.attributes["captacao.resultado"] === "rascunho_gerado");
  const durations = runs.map((r) => r.durationMs);
  const tokensIn = runs.reduce((s, r) => s + num(r.attributes["gen_ai.usage.input_tokens"]), 0);
  const tokensOut = runs.reduce((s, r) => s + num(r.attributes["gen_ai.usage.output_tokens"]), 0);
  const custo = runs.reduce((s, r) => s + num(r.attributes["gen_ai.cost_usd"]), 0);

  // primeira decisão de cada rascunho dentro do período
  const primeira = new Map<string, TriagemRow>();
  for (const t of triagens.filter((x) => inRange(x.decidido_em))) {
    if (!primeira.has(t.pre_esboco_id)) primeira.set(t.pre_esboco_id, t);
  }
  const decisoes = [...primeira.values()];
  const conta = (d: string) => decisoes.filter((x) => x.decisao === d).length;

  return {
    periodo: periodo.rotulo,
    inicio: periodo.inicio.toISOString(),
    fim: periodo.fim.toISOString(),
    execucoes: runs.length,
    rascunhosGerados: ok.length,
    falhasValidacao: runs.length - ok.length,
    schemaValidoPrimeiraPct: pct(runs.filter((r) => r.attributes["captacao.schema_valido_1a"] === true).length, runs.length),
    fundamentadosPct: pct(ok.filter((r) => r.attributes["captacao.fundamentado"] === true).length, ok.length),
    latenciaMs: {
      media: Math.round(avg(durations)),
      p50: Math.round(percentile(durations, 50)),
      p95: Math.round(percentile(durations, 95)),
    },
    tokens: {
      entrada: tokensIn,
      saida: tokensOut,
      estimados: runs.some((r) => r.attributes["gen_ai.usage.estimated"] === true),
    },
    custoUsd: {
      total: Math.round(custo * 10_000) / 10_000,
      medioPorExecucao: runs.length ? Math.round((custo / runs.length) * 10_000) / 10_000 : 0,
    },
    similaridadeTopMedia: Math.round(avg(runs.map((r) => num(r.attributes["rag.top_similarity"]))) * 1000) / 1000,
    piiRemovidos: runs.reduce((s, r) => s + num(r.attributes["guardrail.pii.removidos"]), 0),
    triagem: {
      total: decisoes.length,
      aprovados: conta("aprovado"),
      ajustes: conta("ajustes"),
      recusados: conta("recusado"),
      aceitosSemRetrabalhoPct: pct(conta("aprovado"), decisoes.length),
    },
  };
}

export function renderMarkdown(m: MetricasSemana): string {
  const est = m.tokens.estimados ? " (estimado)" : "";
  return [
    `# Uso da IA na Captação — semana ${m.periodo}`,
    "",
    `Período: ${m.inicio.slice(0, 10)} a ${new Date(new Date(m.fim).getTime() - 1).toISOString().slice(0, 10)}`,
    "",
    "| Indicador | Valor |",
    "|---|---|",
    `| Execuções do agente | ${m.execucoes} |`,
    `| Rascunhos gerados | ${m.rascunhosGerados} |`,
    `| Falhas de validação (após reparo) | ${m.falhasValidacao} |`,
    `| Schema válido na 1ª tentativa | ${m.schemaValidoPrimeiraPct}% |`,
    `| Rascunhos fundamentados (fontes no contexto, sem PII) | ${m.fundamentadosPct}% |`,
    `| Latência média / p50 / p95 | ${m.latenciaMs.media} / ${m.latenciaMs.p50} / ${m.latenciaMs.p95} ms |`,
    `| Tokens de entrada / saída${est} | ${m.tokens.entrada} / ${m.tokens.saida} |`,
    `| Custo total / médio por execução${est} | US$ ${m.custoUsd.total.toFixed(4)} / US$ ${m.custoUsd.medioPorExecucao.toFixed(4)} |`,
    `| Similaridade média do melhor trecho | ${m.similaridadeTopMedia} |`,
    `| Dados pessoais removidos da entrada | ${m.piiRemovidos} |`,
    `| Rascunhos triados | ${m.triagem.total} |`,
    `| Aceitos sem retrabalho | ${m.triagem.aceitosSemRetrabalhoPct}% (${m.triagem.aprovados} aprovados, ${m.triagem.ajustes} com ajustes, ${m.triagem.recusados} recusados) |`,
    "",
    "Fonte: spans `captacao.pre_esboco` do OpenTelemetry e decisões de triagem registradas pela equipe.",
    "",
  ].join("\n");
}
