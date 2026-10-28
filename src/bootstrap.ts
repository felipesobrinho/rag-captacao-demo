import { openDb } from "./db.js";
import { getEmbeddingProvider } from "./embeddings.js";
import { ingestLibrary, seedDemandas } from "./ingest.js";
import { getLlmProvider } from "./llm.js";
import { initTelemetry } from "./telemetry.js";
import type { AgentDeps } from "./agent.js";

/** Abre banco, telemetria e provedores; garante Biblioteca indexada e demandas de exemplo. */
export async function bootstrap(options: { inMemory?: boolean; tracesFile?: string; seed?: boolean } = {}): Promise<AgentDeps> {
  await initTelemetry({ tracesFile: options.tracesFile });
  const db = await openDb({ inMemory: options.inMemory });
  const embeddings = getEmbeddingProvider();
  await ingestLibrary(db, embeddings);
  if (options.seed !== false) await seedDemandas(db);
  return { db, embeddings, llm: getLlmProvider() };
}
