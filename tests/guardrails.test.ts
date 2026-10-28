import { describe, expect, it } from "vitest";
import { checkGroundedness, findPii, redactPii, validatePreEsboco } from "../src/guardrails.js";
import { offlineDraft } from "../src/llm.js";

const chunk = (id: string, secao: string, conteudo: string) => ({
  id,
  documento_id: id.split("#")[0],
  titulo: "Projeto Fictício",
  secao,
  conteudo,
  similarity: 0.4,
});

const demanda = { id: "d1", titulo: "Demanda de teste", setor: "Setor X", descricao: "Descrição da demanda de teste.", objetivo: "Resolver o problema de teste." };

describe("guardrails", () => {
  it("remove e-mail, CPF e telefone antes de enviar ao modelo", () => {
    const r = redactPii("Fale com ana.demo@exemplo.com, CPF 000.000.000-00, tel (31) 90000-0000.");
    expect(r.count).toBe(3);
    expect(r.text).not.toMatch(/@|000\.000/);
    expect(r.kinds.sort()).toEqual(["cpf", "email", "telefone"]);
    expect(findPii({ a: "sem dados" })).toEqual([]);
  });

  it("aceita um rascunho válido e rejeita status diferente de rascunho", () => {
    const draft = offlineDraft(demanda, [chunk("proj-001-x#01", "Escopo do MVP", "Projeto — Escopo\n- Item de escopo um")]);
    expect(validatePreEsboco(draft)).toEqual({ valid: true, errors: [] });
    const r = validatePreEsboco({ ...draft, status: "aprovado" });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toContain("/status");
  });

  it("rejeita campos extras e fontes com id mal formado", () => {
    const draft = offlineDraft(demanda, [chunk("proj-001-x#01", "Escopo do MVP", "x\n- Item de escopo um")]);
    expect(validatePreEsboco({ ...draft, extra: 1 }).valid).toBe(false);
    expect(validatePreEsboco({ ...draft, fontes: [{ chunk_id: "qualquer", uso: "inventado" }] }).valid).toBe(false);
  });

  it("detecta fonte citada que não estava entre os trechos recuperados", () => {
    const g = checkGroundedness({ fontes: [{ chunk_id: "a#01", uso: "ok ok" }, { chunk_id: "b#02", uso: "inventada" }] }, ["a#01"]);
    expect(g.grounded).toBe(false);
    expect(g.notRetrieved).toEqual(["b#02"]);
  });
});
