import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Ajv, type ErrorObject } from "ajv";
import { config } from "./config.js";
import type { PreEsboco } from "./types.js";

/* ---------- 1. Dados pessoais: removidos antes de ir para o modelo ---------- */

const PII_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { label: "cpf", re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g },
  { label: "telefone", re: /(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g },
  { label: "matricula", re: /\bmatr[íi]cula\s*:?\s*\d{4,}\b/gi },
];

export function redactPii(text: string): { text: string; count: number; kinds: string[] } {
  let count = 0;
  const kinds = new Set<string>();
  let out = text;
  for (const { label, re } of PII_PATTERNS) {
    out = out.replace(re, () => {
      count++;
      kinds.add(label);
      return "[removido]";
    });
  }
  return { text: out, count, kinds: [...kinds] };
}

export function findPii(value: unknown): string[] {
  const text = JSON.stringify(value);
  return PII_PATTERNS.flatMap(({ label, re }) => (text.match(new RegExp(re.source, re.flags)) ? [label] : []));
}

/* ---------- 2. Saída estruturada: JSON Schema ---------- */

export const preEsbocoSchema = JSON.parse(
  readFileSync(resolve(config.root, "schemas", "pre-esboco.schema.json"), "utf8"),
) as Record<string, unknown>;

const ajv = new Ajv({ allErrors: true, strict: false });
const validateFn = ajv.compile(preEsbocoSchema);

export interface SchemaResult {
  valid: boolean;
  errors: string[];
}

const describe = (e: ErrorObject) => `${e.instancePath || "(raiz)"} ${e.message ?? "inválido"}`;

export function validatePreEsboco(value: unknown): SchemaResult {
  const valid = validateFn(value) as boolean;
  return { valid, errors: valid ? [] : (validateFn.errors ?? []).map(describe) };
}

/** Schema sem metadados, no formato aceito como input_schema de ferramenta. */
export function toolInputSchema() {
  const { $schema: _s, $id: _i, title: _t, description: _d, ...rest } = preEsbocoSchema;
  return rest;
}

/* ---------- 3. Fundamentação: só pode citar o que foi recuperado ---------- */

export interface Groundedness {
  grounded: boolean;
  cited: string[];
  notRetrieved: string[];
}

export function checkGroundedness(draft: Pick<PreEsboco, "fontes">, retrievedIds: string[]): Groundedness {
  const retrieved = new Set(retrievedIds);
  const cited = [...new Set(draft.fontes.map((f) => f.chunk_id))];
  const notRetrieved = cited.filter((id) => !retrieved.has(id));
  return { grounded: cited.length > 0 && notRetrieved.length === 0, cited, notRetrieved };
}
