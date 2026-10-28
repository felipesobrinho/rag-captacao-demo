import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gerarPreEsboco, type AgentDeps } from "./agent.js";
import { config } from "./config.js";
import { findPii } from "./guardrails.js";
import { saveDemanda } from "./ingest.js";
import type { Demanda } from "./types.js";

export interface CasoAvaliacao {
  id: string;
  descricao: string;
  demanda: Demanda;
  esperado: { documentos_relevantes: string[]; termos_no_rascunho: string[] };
}

export interface ResultadoCaso {
  id: string;
  descricao: string;
  recall: number;
  schemaValido: boolean;
  fundamentado: boolean;
  semPii: boolean;
  statusRascunho: boolean;
  cobertura: number;
  topSimilaridade: number;
  aprovado: boolean;
}

export interface ResumoAvaliacao {
  casos: ResultadoCaso[];
  recallMedio: number;
  schemaValidoPct: number;
  fundamentadoPct: number;
  semPiiPct: number;
  coberturaMedia: number;
  aprovado: boolean;
  limites: typeof LIMITES;
}

/** Limites mínimos para a avaliação passar (usados também na CI). */
export const LIMITES = { recallMedio: 0.8, schemaValidoPct: 100, fundamentadoPct: 100, semPiiPct: 100, coberturaMedia: 0.6 };

export const carregarCasos = (file = resolve(config.root, "eval", "casos.json")) =>
  JSON.parse(readFileSync(file, "utf8")) as CasoAvaliacao[];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function pontuarCaso(
  caso: CasoAvaliacao,
  run: { ok: boolean; preEsboco?: unknown; chunks: { documento_id: string; similarity: number }[]; fundamentado: boolean },
): ResultadoCaso {
  const docs = new Set(run.chunks.map((c) => c.documento_id));
  const relevantes = caso.esperado.documentos_relevantes;
  const recall = relevantes.length ? relevantes.filter((d) => docs.has(d)).length / relevantes.length : 1;
  const texto = norm(JSON.stringify(run.preEsboco ?? {}));
  const termos = caso.esperado.termos_no_rascunho;
  const cobertura = termos.length ? termos.filter((t) => texto.includes(norm(t))).length / termos.length : 1;
  const semPii = findPii(run.preEsboco ?? {}).length === 0;
  const statusRascunho = (run.preEsboco as { status?: string } | undefined)?.status === "rascunho";
  const r = {
    id: caso.id,
    descricao: caso.descricao,
    recall,
    schemaValido: run.ok,
    fundamentado: run.fundamentado,
    semPii,
    statusRascunho,
    cobertura,
    topSimilaridade: run.chunks[0]?.similarity ?? 0,
  };
  return { ...r, aprovado: recall >= 1 && run.ok && run.fundamentado && semPii && statusRascunho && cobertura >= 0.5 };
}

export async function avaliar(deps: AgentDeps, casos = carregarCasos()): Promise<ResumoAvaliacao> {
  const resultados: ResultadoCaso[] = [];
  for (const caso of casos) {
    await saveDemanda(deps.db, caso.demanda);
    const run = await gerarPreEsboco(deps, caso.demanda);
    resultados.push(pontuarCaso(caso, run));
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const pct = (f: (r: ResultadoCaso) => boolean) => Math.round((resultados.filter(f).length / resultados.length) * 1000) / 10;
  const resumo = {
    casos: resultados,
    recallMedio: Math.round(mean(resultados.map((r) => r.recall)) * 1000) / 1000,
    schemaValidoPct: pct((r) => r.schemaValido),
    fundamentadoPct: pct((r) => r.fundamentado),
    semPiiPct: pct((r) => r.semPii),
    coberturaMedia: Math.round(mean(resultados.map((r) => r.cobertura)) * 1000) / 1000,
    limites: LIMITES,
  };
  const aprovado =
    resumo.recallMedio >= LIMITES.recallMedio &&
    resumo.schemaValidoPct >= LIMITES.schemaValidoPct &&
    resumo.fundamentadoPct >= LIMITES.fundamentadoPct &&
    resumo.semPiiPct >= LIMITES.semPiiPct &&
    resumo.coberturaMedia >= LIMITES.coberturaMedia;
  return { ...resumo, aprovado };
}
