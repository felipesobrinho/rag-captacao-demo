import { config } from "./config.js";
import { toVectorLiteral, type Db } from "./db.js";
import type { EmbeddingProvider } from "./embeddings.js";
import { withSpan } from "./telemetry.js";
import type { RetrievedChunk } from "./types.js";

/** Busca vetorial via match_chunks (mesma função usada como RPC no Supabase). */
export async function retrieve(
  db: Db,
  embeddings: EmbeddingProvider,
  query: string,
  k = config.rag.topK,
  minSimilarity = config.rag.minSimilarity,
): Promise<RetrievedChunk[]> {
  return withSpan(
    "rag.retrieve",
    { "rag.k": k, "rag.min_similarity": minSimilarity, "rag.embedding.provider": embeddings.name },
    async (span) => {
      const [vector] = await embeddings.embed([query]);
      const { rows } = await db.query<RetrievedChunk>(
        "select * from match_chunks($1::vector, $2, $3)",
        [toVectorLiteral(vector), k, minSimilarity],
      );
      const chunks = rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
      span.setAttributes({
        "rag.resultados": chunks.length,
        "rag.top_similarity": chunks[0]?.similarity ?? 0,
        "rag.chunk_ids": chunks.map((c) => c.id),
        "rag.documentos": [...new Set(chunks.map((c) => c.documento_id))],
      });
      return chunks;
    },
  );
}
