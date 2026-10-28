import { describe, expect, it } from "vitest";
import { cosine, localEmbedding, normalize } from "../src/embeddings.js";

describe("embedding local", () => {
  it("é determinístico e normalizado", () => {
    const a = localEmbedding("Reserva de salas com aprovação");
    expect(a).toEqual(localEmbedding("Reserva de salas com aprovação"));
    expect(a).toHaveLength(512);
    expect(cosine(a, a)).toBeCloseTo(1, 6);
  });

  it("aproxima textos com termos em comum e ignora acentos e stopwords", () => {
    expect(normalize("Aprovação das Reservas")).toEqual(["aprova", "reserv"]);
    const q = localEmbedding("reservar o auditório com aprovação");
    const near = localEmbedding("reservas de espaços com fluxo de aprovação");
    const far = localEmbedding("cálculo de repasse financeiro mensal");
    expect(cosine(q, near)).toBeGreaterThan(cosine(q, far));
  });
});
