import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { chunkMarkdown } from "./chunking.js";
import { config } from "./config.js";
import { toVectorLiteral, type Db } from "./db.js";
import type { EmbeddingProvider } from "./embeddings.js";
import { withSpan } from "./telemetry.js";
import type { Demanda } from "./types.js";

export interface IngestReport {
  documentos: number;
  atualizados: number;
  chunks: number;
}

/**
 * Ingestão da Biblioteca de Projetos: lê os markdowns, quebra em chunks por seção,
 * gera embeddings e grava no pgvector. Documentos sem mudança (mesmo hash) são pulados.
 */
export async function ingestLibrary(
  db: Db,
  embeddings: EmbeddingProvider,
  dir = resolve(config.root, "data", "biblioteca"),
): Promise<IngestReport> {
  return withSpan("rag.ingest", { "rag.embedding.provider": embeddings.name, "rag.embedding.dim": embeddings.dim }, async (span) => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
    let atualizados = 0;
    let totalChunks = 0;

    for (const file of files) {
      const id = basename(file, ".md");
      const markdown = readFileSync(resolve(dir, file), "utf8");
      const hash = createHash("sha256").update(markdown).update(embeddings.name).digest("hex");
      const titulo = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? id;
      const tipo = id.startsWith("modelo-") ? "modelo" : "projeto";

      const existing = await db.query<{ hash: string }>("select hash from documentos where id = $1", [id]);
      const chunks = chunkMarkdown(id, markdown);
      totalChunks += chunks.length;
      if (existing.rows[0]?.hash === hash) continue;

      const vectors = await embeddings.embed(chunks.map((c) => c.conteudo));
      await db.query("delete from chunks where documento_id = $1", [id]);
      await db.query(
        `insert into documentos (id, titulo, tipo, caminho, hash) values ($1, $2, $3, $4, $5)
         on conflict (id) do update set titulo = excluded.titulo, tipo = excluded.tipo,
           caminho = excluded.caminho, hash = excluded.hash`,
        [id, titulo, tipo, `data/biblioteca/${file}`, hash],
      );
      for (const [i, c] of chunks.entries()) {
        await db.query(
          `insert into chunks (id, documento_id, ordem, secao, conteudo, tokens, embedding)
           values ($1, $2, $3, $4, $5, $6, $7::vector)`,
          [c.id, id, c.ordem, c.secao, c.conteudo, c.tokens, toVectorLiteral(vectors[i])],
        );
      }
      atualizados++;
    }

    span.setAttributes({ "rag.documentos": files.length, "rag.documentos_atualizados": atualizados, "rag.chunks": totalChunks });
    return { documentos: files.length, atualizados, chunks: totalChunks };
  });
}

/** Simula a chegada das respostas do formulário (no real: itens de uma lista do SharePoint). */
export async function seedDemandas(db: Db, dir = resolve(config.root, "data", "demandas")) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  for (const file of files) {
    const d = JSON.parse(readFileSync(resolve(dir, file), "utf8")) as Demanda;
    await saveDemanda(db, d);
  }
  return files.length;
}

export async function saveDemanda(db: Db, d: Demanda) {
  await db.query(
    `insert into demandas (id, titulo, setor, descricao, objetivo, prazo_desejado)
     values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing`,
    [d.id, d.titulo, d.setor, d.descricao, d.objetivo, d.prazo_desejado ?? null],
  );
}
