import { describe, expect, it } from "vitest";
import { chunkMarkdown, splitSections } from "../src/chunking.js";

const md = `# Projeto X

## Problema
Texto do problema.

## Escopo do MVP
- Item A
- Item B

### HU-01 — Algo
Como pessoa, quero algo, para um fim.
`;

describe("chunking", () => {
  it("separa por seção e guarda o caminho do título", () => {
    const { title, sections } = splitSections(md);
    expect(title).toBe("Projeto X");
    expect(sections.map((s) => s.heading)).toEqual(["Problema", "Escopo do MVP", "Escopo do MVP › HU-01 — Algo"]);
  });

  it("gera ids estáveis no formato documento#NN com o título no conteúdo", () => {
    const chunks = chunkMarkdown("proj-x", md);
    expect(chunks.map((c) => c.id)).toEqual(["proj-x#00", "proj-x#01", "proj-x#02"]);
    expect(chunks[1].conteudo.startsWith("Projeto X — Escopo do MVP")).toBe(true);
  });

  it("quebra seções longas respeitando o limite e com sobreposição", () => {
    const long = `# Doc\n\n## Longa\n${Array.from({ length: 30 }, (_, i) => `Parágrafo ${i} com algum texto para ocupar espaço.`).join("\n\n")}`;
    const chunks = chunkMarkdown("doc", long, { maxTokens: 60, overlapTokens: 15 });
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.tokens).toBeLessThanOrEqual(80);
    const first = chunks[0].conteudo.split("\n\n").at(-1)!;
    expect(chunks[1].conteudo).toContain(first);
  });
});
