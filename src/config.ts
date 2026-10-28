import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/** Carrega .env sem dependências (só chaves ainda não definidas no ambiente). */
function loadDotEnv(path = resolve(process.cwd(), ".env")) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] === undefined) process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
}

loadDotEnv();

const env = (key: string, fallback = "") => (process.env[key] ?? "").trim() || fallback;
const num = (key: string, fallback: number) => {
  const value = Number(env(key));
  return Number.isFinite(value) && env(key) !== "" ? value : fallback;
};

export const EMBEDDING_DIM = 512;

export const config = {
  root: process.cwd(),
  dataDir: resolve(process.cwd(), ".data"),
  databaseUrl: env("DATABASE_URL"),
  llm: {
    provider: env("LLM_PROVIDER", env("ANTHROPIC_API_KEY") ? "anthropic" : "offline") as "anthropic" | "offline",
    anthropicApiKey: env("ANTHROPIC_API_KEY"),
    model: env("ANTHROPIC_MODEL", "claude-sonnet-4-5"),
    priceInputPerMTok: num("LLM_PRICE_INPUT_PER_MTOK", 3),
    priceOutputPerMTok: num("LLM_PRICE_OUTPUT_PER_MTOK", 15),
    maxTokens: num("LLM_MAX_TOKENS", 2000),
  },
  embeddings: {
    provider: env("EMBEDDINGS_PROVIDER", "local") as "local" | "openai",
    openaiApiKey: env("OPENAI_API_KEY"),
    openaiModel: env("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
  },
  rag: {
    topK: num("RAG_TOP_K", 8),
    minSimilarity: num("RAG_MIN_SIMILARITY", 0.05),
  },
  otel: {
    otlpEndpoint: env("OTEL_EXPORTER_OTLP_ENDPOINT"),
    console: env("OTEL_CONSOLE") === "1",
    tracesFile: env("TRACES_FILE", resolve(process.cwd(), ".data", "traces.jsonl")),
  },
  teamsWebhookUrl: env("TEAMS_WEBHOOK_URL"),
  port: num("PORT", 5173),
};

export type Config = typeof config;
