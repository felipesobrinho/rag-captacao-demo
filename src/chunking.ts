export interface Chunk {
  id: string;
  documentoId: string;
  ordem: number;
  secao: string;
  conteudo: string;
  tokens: number;
}

export interface ChunkOptions {
  /** Tamanho máximo aproximado do chunk, em tokens. */
  maxTokens?: number;
  /** Quantos tokens do fim do chunk anterior repetir no próximo (contexto). */
  overlapTokens?: number;
}

/** Estimativa barata de tokens (~4 caracteres por token em português). */
export const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));

interface Section {
  heading: string;
  body: string;
}

/** Divide o markdown por títulos (#, ##, ###), mantendo o caminho do título como contexto. */
export function splitSections(markdown: string): { title: string; sections: Section[] } {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let title = "";
  const path: string[] = [];
  const sections: Section[] = [];
  let current: Section = { heading: "", body: "" };

  const flush = () => {
    if (current.body.trim()) sections.push({ heading: current.heading, body: current.body.trim() });
  };

  for (const line of lines) {
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      const level = h[1].length;
      const text = h[2].trim();
      if (level === 1 && !title) title = text;
      path.length = level - 1;
      path[level - 1] = text;
      current = { heading: path.filter(Boolean).slice(1).join(" › ") || text, body: "" };
    } else {
      current.body += `${line}\n`;
    }
  }
  flush();
  return { title, sections };
}

/** Quebra um texto longo em blocos por parágrafo e, se preciso, por frase. */
function splitLong(body: string, maxTokens: number, overlapTokens: number): string[] {
  const units = body
    .split(/\n{2,}/)
    .flatMap((p) => (estimateTokens(p) > maxTokens ? p.split(/(?<=[.!?;])\s+/) : [p]))
    .map((u) => u.trim())
    .filter(Boolean);

  const out: string[] = [];
  let buf: string[] = [];
  let size = 0;
  for (const unit of units) {
    const t = estimateTokens(unit);
    if (size + t > maxTokens && buf.length) {
      out.push(buf.join("\n\n"));
      // overlap: carrega as últimas unidades até o limite de overlap
      const carry: string[] = [];
      let carrySize = 0;
      for (let i = buf.length - 1; i >= 0 && carrySize + estimateTokens(buf[i]) <= overlapTokens; i--) {
        carry.unshift(buf[i]);
        carrySize += estimateTokens(buf[i]);
      }
      buf = carry;
      size = carrySize;
    }
    buf.push(unit);
    size += t;
  }
  if (buf.length) out.push(buf.join("\n\n"));
  return out;
}

/**
 * Chunking orientado a seções: cada seção do documento vira um ou mais chunks.
 * O texto indexado leva o título do documento e da seção, o que melhora a busca
 * sem precisar de prompt gigante na hora da geração.
 */
export function chunkMarkdown(documentoId: string, markdown: string, options: ChunkOptions = {}): Chunk[] {
  const maxTokens = options.maxTokens ?? 220;
  const overlapTokens = options.overlapTokens ?? 40;
  const { title, sections } = splitSections(markdown);
  const chunks: Chunk[] = [];
  for (const section of sections) {
    for (const piece of splitLong(section.body, maxTokens, overlapTokens)) {
      const ordem = chunks.length;
      const header = [title, section.heading].filter(Boolean).join(" — ");
      const conteudo = header ? `${header}\n${piece}` : piece;
      chunks.push({
        id: `${documentoId}#${String(ordem).padStart(2, "0")}`,
        documentoId,
        ordem,
        secao: section.heading || title,
        conteudo,
        tokens: estimateTokens(conteudo),
      });
    }
  }
  return chunks;
}
