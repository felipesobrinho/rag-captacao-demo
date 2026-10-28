import { openDb } from "../db.js";
import { getEmbeddingProvider } from "../embeddings.js";
import { ingestLibrary, seedDemandas } from "../ingest.js";
import { initTelemetry, shutdownTelemetry } from "../telemetry.js";

await initTelemetry();
const db = await openDb();
const report = await ingestLibrary(db, getEmbeddingProvider());
const demandas = await seedDemandas(db);
console.log(`Biblioteca: ${report.documentos} documentos (${report.atualizados} atualizados), ${report.chunks} chunks.`);
console.log(`Demandas de exemplo: ${demandas}.`);
await db.close();
await shutdownTelemetry();
