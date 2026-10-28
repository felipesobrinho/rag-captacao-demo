import { config } from "./config.js";
import { estimateTokens } from "./chunking.js";
import { toolInputSchema } from "./guardrails.js";
import { SYSTEM_PROMPT, TOOL_NAME } from "./prompt.js";
import type { Demanda, PreEsboco, RetrievedChunk } from "./types.js";

export interface LlmRequest {
  user: string;
  demanda: Demanda;
  chunks: RetrievedChunk[];
  /** Presente na segunda tentativa: o que falhou na validação da primeira. */
  repair?: { previous: unknown; toolUseId?: string; errors: string[] };
}

export interface LlmResponse {
  output: unknown;
  toolUseId?: string;
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; estimated: boolean };
}

export interface LlmProvider {
  name: string;
  model: string;
  generate(req: LlmRequest): Promise<LlmResponse>;
}

export const costUsd = (inputTokens: number, outputTokens: number) =>
  (inputTokens * config.llm.priceInputPerMTok + outputTokens * config.llm.priceOutputPerMTok) / 1_000_000;

/* ------------------------------ Claude ------------------------------ */

function anthropicProvider(): LlmProvider {
  return {
    name: "anthropic",
    model: config.llm.model,
    async generate(req) {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: config.llm.anthropicApiKey });
      const tool = {
        name: TOOL_NAME,
        description: "Registra o pré-esboço do projeto (sempre como rascunho) no formato exigido pela equipe.",
        input_schema: toolInputSchema(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages: any[] = [{ role: "user", content: req.user }];
      if (req.repair) {
        messages.push({
          role: "assistant",
          content: [{ type: "tool_use", id: req.repair.toolUseId ?? "toolu_previous", name: TOOL_NAME, input: req.repair.previous }],
        });
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: req.repair.toolUseId ?? "toolu_previous",
              is_error: true,
              content: `A saída não passou na validação do schema:\n- ${req.repair.errors.join("\n- ")}\nCorrija e chame a ferramenta de novo.`,
            },
          ],
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await client.messages.create({
        model: config.llm.model,
        max_tokens: config.llm.maxTokens,
        system: SYSTEM_PROMPT,
        tools: [tool],
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages,
      } as never);
      const block = res.content.find((b: { type: string }) => b.type === "tool_use");
      return {
        output: block?.input ?? null,
        toolUseId: block?.id,
        provider: "anthropic",
        model: res.model ?? config.llm.model,
        usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, estimated: false },
      };
    },
  };
}

/* ------------------------------ Offline ------------------------------ */

const bullets = (text: string) =>
  text
    .split("\n")
    .filter((l) => /^\s*-\s+/.test(l))
    .map((l) => l.replace(/^\s*-\s+/, "").trim());

const sentence = (text: string) => (text.match(/^[^.!?]+[.!?]?/)?.[0] ?? text).trim();

const uniq = (items: string[], max: number) => [...new Set(items.filter((i) => i.length >= 5))].slice(0, max);

/**
 * Gerador determinístico usado quando não há chave de API: monta o rascunho a partir
 * da demanda e dos trechos recuperados, seguindo as mesmas regras do prompt (só usa o
 * contexto, cita as fontes, marca lacunas). Serve para demo, testes e avaliação reprodutível.
 */
export function offlineDraft(demanda: Demanda, chunks: RetrievedChunk[]): PreEsboco {
  const projetos = chunks.filter((c) => c.documento_id.startsWith("proj-"));
  const bySection = (name: RegExp) => projetos.filter((c) => name.test(c.secao));
  const firstByDoc = new Map<string, RetrievedChunk>();
  for (const c of projetos) if (!firstByDoc.has(c.documento_id)) firstByDoc.set(c.documento_id, c);
  const topDocs = [...firstByDoc.values()].slice(0, 2);
  const mainDoc = topDocs[0]?.documento_id;
  const fromMain = (re: RegExp) => bySection(re).filter((c) => c.documento_id === mainDoc);

  const escopo = uniq(fromMain(/escopo do mvp/i).flatMap((c) => bullets(c.conteudo)), 6);
  const fora = uniq(fromMain(/fora do escopo/i).flatMap((c) => bullets(c.conteudo)), 4);
  const integracoes = uniq(fromMain(/integra/i).flatMap((c) => bullets(c.conteudo)), 4);
  const riscos = uniq(bySection(/riscos/i).flatMap((c) => bullets(c.conteudo)), 4);

  const historias = fromMain(/hist[óo]rias/i)
    .map((c) => {
      const m = c.conteudo.match(/Como ([^,]+), quero ([^,]+(?:,[^,]+)?), para ([^.]+)\./);
      const criterios = bullets(c.conteudo)
        .map((b) => b.match(/^Dado (.+?), quando (.+?), ent[ãa]o (.+?)\.?$/i))
        .filter((x): x is RegExpMatchArray => Boolean(x))
        .map((x) => ({ dado: x[1], quando: x[2], entao: x[3] }));
      return m && criterios.length ? { como: m[1], quero: m[2], para: m[3], criterios } : null;
    })
    .filter((h): h is NonNullable<typeof h> => Boolean(h))
    .slice(0, 3);
  if (!historias.length) {
    historias.push({
      como: `integrante do setor ${demanda.setor}`,
      quero: demanda.objetivo.replace(/\.$/, "").toLowerCase(),
      para: "resolver o problema descrito na demanda",
      criterios: [{ dado: "a solução disponível", quando: "o setor executar o processo", entao: "o resultado esperado é registrado" }],
    });
  }

  const usados = [
    ...fromMain(/escopo do mvp|hist[óo]rias|integra|fora do escopo/i),
    ...bySection(/riscos/i).slice(0, 1),
  ];
  const fontes = uniq(usados.map((c) => c.id), 8).map((id) => {
    const c = chunks.find((x) => x.id === id)!;
    return { chunk_id: id, uso: `Seção "${c.secao}" de "${c.titulo}" usada como referência` };
  });
  if (!fontes.length && chunks[0]) {
    fontes.push({ chunk_id: chunks[0].id, uso: `Trecho mais próximo: "${chunks[0].titulo}"` });
  }

  const lacunas: string[] = [];
  const perguntas: string[] = [];
  if (!demanda.prazo_desejado) {
    lacunas.push("Prazo desejado não informado no formulário");
    perguntas.push("Qual é o prazo desejado para a primeira versão?");
  }
  if (!/\d/.test(demanda.descricao)) {
    lacunas.push("Volume de uso (pessoas, itens ou pedidos por mês) não informado");
    perguntas.push("Qual é o volume esperado de uso (pessoas, itens ou pedidos por mês)?");
  }
  lacunas.push("Quem aprova e quem opera a solução no dia a dia");
  perguntas.push("Quem aprova e quem opera a solução no dia a dia?");
  if (!mainDoc) lacunas.push("Nenhum projeto semelhante encontrado na Biblioteca");

  const top = chunks[0]?.similarity ?? 0;
  const confianca = top >= 0.35 && demanda.prazo_desejado ? "alta" : top >= 0.2 ? "media" : "baixa";

  return {
    titulo: demanda.titulo,
    status: "rascunho",
    resumo: `${demanda.setor}: ${sentence(demanda.objetivo)}${topDocs[0] ? ` Há projeto homologado semelhante na Biblioteca (${topDocs[0].titulo}) que pode ser reaproveitado.` : ""}`.slice(0, 700),
    problema: demanda.descricao.slice(0, 900),
    objetivos: uniq([demanda.objetivo.replace(/\.$/, "")], 5),
    escopo_mvp: escopo.length ? escopo : [demanda.objetivo.replace(/\.$/, "")],
    fora_do_escopo: fora,
    historias_sugeridas: historias,
    integracoes_possiveis: integracoes,
    riscos,
    perguntas_para_entendimento: uniq(
      [
        ...perguntas,
        topDocs[0] ? `O projeto "${topDocs[0].titulo}" atende parte da demanda? O que muda?` : "",
        "Que sistemas ou planilhas são usados hoje e precisam ser integrados ou migrados?",
      ],
      8,
    ),
    projetos_relacionados: topDocs.map((c) => ({
      documento_id: c.documento_id,
      titulo: c.titulo,
      motivo: `Trechos semelhantes (similaridade ${c.similarity.toFixed(2)}) em "${c.secao}"`,
    })),
    fontes,
    lacunas,
    confianca,
  };
}

function offlineProvider(): LlmProvider {
  return {
    name: "offline",
    model: "offline-demo",
    async generate(req) {
      let output: unknown = offlineDraft(req.demanda, req.chunks);
      // Gancho de teste: força uma primeira saída inválida para exercitar o reparo.
      if (process.env.OFFLINE_FAIL_FIRST === "1" && !req.repair) output = { ...(output as object), status: "aprovado" };
      const inputTokens = estimateTokens(SYSTEM_PROMPT + req.user + (req.repair ? JSON.stringify(req.repair) : ""));
      return {
        output,
        provider: "offline",
        model: "offline-demo",
        usage: { inputTokens, outputTokens: estimateTokens(JSON.stringify(output)), estimated: true },
      };
    },
  };
}

export function getLlmProvider(): LlmProvider {
  return config.llm.provider === "anthropic" && config.llm.anthropicApiKey ? anthropicProvider() : offlineProvider();
}
