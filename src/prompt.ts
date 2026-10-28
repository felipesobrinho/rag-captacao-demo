import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "./config.js";
import type { Demanda, RetrievedChunk } from "./types.js";

export const SYSTEM_PROMPT = readFileSync(resolve(config.root, "prompts", "pre-esboco.system.md"), "utf8");

export const TOOL_NAME = "registrar_pre_esboco";

const escape = (s: string) => s.replace(/</g, "‹").replace(/>/g, "›");

/**
 * Monta a mensagem do usuário: só a demanda (já sem dados pessoais) e os trechos
 * recuperados — nada de colar a Biblioteca inteira no prompt.
 */
export function buildUserPrompt(demanda: Demanda, chunks: RetrievedChunk[]): string {
  const ctx = chunks
    .map(
      (c) =>
        `<trecho id="${c.id}" documento="${escape(c.titulo)}" secao="${escape(c.secao)}" similaridade="${c.similarity.toFixed(3)}">\n${escape(c.conteudo)}\n</trecho>`,
    )
    .join("\n");
  return [
    "<demanda>",
    `titulo: ${escape(demanda.titulo)}`,
    `setor: ${escape(demanda.setor)}`,
    `descricao: ${escape(demanda.descricao)}`,
    `objetivo: ${escape(demanda.objetivo)}`,
    `prazo_desejado: ${demanda.prazo_desejado ? escape(demanda.prazo_desejado) : "não informado"}`,
    "</demanda>",
    "",
    "<contexto>",
    ctx || "(nenhum trecho relevante encontrado)",
    "</contexto>",
    "",
    `Gere o pré-esboço chamando a ferramenta ${TOOL_NAME}.`,
  ].join("\n");
}
