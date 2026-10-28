import { createHash } from "node:crypto";
import { config, EMBEDDING_DIM } from "./config.js";

export interface EmbeddingProvider {
  name: string;
  dim: number;
  embed(texts: string[]): Promise<number[][]>;
}

const STOPWORDS = new Set(
  (
    "a o os as um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas para pra com sem " +
    "e ou que se ao aos à às é ser são foi era como mais menos muito muita já não sim também sobre entre até " +
    "este esta estes estas esse essa esses essas isso isto aquele aquela seu sua seus suas nosso nossa " +
    "ter tem têm há quando onde qual quais cada todo toda todos todas outro outra deve devem pode podem"
  ).split(/\s+/),
);

/** Normaliza para busca: minúsculas, sem acento, só letras e números. */
export function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    // radical simples: corta sufixos comuns para aproximar flexões (reserva/reservas/reservar)
    .map((w) => (w.length > 6 ? w.slice(0, 6) : w));
}

function hashToIndex(feature: string, dim: number): { index: number; sign: number } {
  const h = createHash("md5").update(feature).digest();
  return { index: h.readUInt32BE(0) % dim, sign: h[4] & 1 ? 1 : -1 };
}

/**
 * Embedding local e determinístico (feature hashing de termos e bigramas, TF log, L2).
 * Não é um modelo semântico: serve para rodar o pipeline inteiro sem chave de API e
 * com resultados reprodutíveis nos testes e na avaliação. Troque por um provedor real
 * (EMBEDDINGS_PROVIDER=openai) para busca semântica de verdade.
 */
export function localEmbedding(text: string, dim = EMBEDDING_DIM): number[] {
  const tokens = normalize(text);
  const counts = new Map<string, number>();
  const add = (f: string, w: number) => counts.set(f, (counts.get(f) ?? 0) + w);
  tokens.forEach((t, i) => {
    add(`u:${t}`, 1);
    if (i > 0) add(`b:${tokens[i - 1]}_${t}`, 0.5);
  });
  const vec = new Array<number>(dim).fill(0);
  for (const [feature, count] of counts) {
    const { index, sign } = hashToIndex(feature, dim);
    vec[index] += sign * (1 + Math.log(count));
  }
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}

export const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

const localProvider: EmbeddingProvider = {
  name: "local-hashing",
  dim: EMBEDDING_DIM,
  embed: async (texts) => texts.map((t) => localEmbedding(t)),
};

const openaiProvider = (): EmbeddingProvider => ({
  name: `openai:${config.embeddings.openaiModel}`,
  dim: EMBEDDING_DIM,
  embed: async (texts) => {
    if (!config.embeddings.openaiApiKey) throw new Error("OPENAI_API_KEY não definido");
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.embeddings.openaiApiKey}`,
      },
      body: JSON.stringify({ model: config.embeddings.openaiModel, input: texts, dimensions: EMBEDDING_DIM }),
    });
    if (!res.ok) throw new Error(`Embeddings falharam: HTTP ${res.status}`);
    const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
    return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  },
});

export function getEmbeddingProvider(): EmbeddingProvider {
  return config.embeddings.provider === "openai" ? openaiProvider() : localProvider;
}
