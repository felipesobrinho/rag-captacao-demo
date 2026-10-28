import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "./config.js";

export interface QueryResult<T> {
  rows: T[];
}

/** Interface mínima comum a PGlite e node-postgres. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  kind: "pglite" | "postgres";
}

/** Formata um vetor no literal aceito pelo pgvector: '[0.1,0.2,...]'. */
export const toVectorLiteral = (v: number[]) => `[${v.map((x) => Number(x.toFixed(6))).join(",")}]`;

async function openPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite/vector");
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const pg = new PGlite({ ...(dataDir ? { dataDir } : {}), extensions: { vector } });
  await pg.waitReady;
  return {
    kind: "pglite",
    query: async <T>(sql: string, params: unknown[] = []) => {
      const r = await pg.query<T>(sql, params);
      return { rows: r.rows };
    },
    exec: async (sql: string) => {
      await pg.exec(sql);
    },
    close: () => pg.close(),
  };
}

async function openPostgres(url: string): Promise<Db> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  return {
    kind: "postgres",
    query: async <T>(sql: string, params: unknown[] = []) => {
      const r = await pool.query(sql, params);
      return { rows: r.rows as T[] };
    },
    exec: async (sql: string) => {
      await pool.query(sql);
    },
    close: () => pool.end(),
  };
}

export async function migrate(db: Db) {
  const dir = resolve(config.root, "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(resolve(dir, file), "utf8"));
  }
}

/**
 * Abre o banco: Supabase/Postgres quando DATABASE_URL existe; senão PGlite
 * (Postgres em WASM com pgvector), persistido em .data/pglite ou em memória.
 */
export async function openDb(options: { inMemory?: boolean } = {}): Promise<Db> {
  const db = config.databaseUrl
    ? await openPostgres(config.databaseUrl)
    : await openPglite(options.inMemory ? undefined : resolve(config.dataDir, "pglite"));
  await migrate(db);
  return db;
}
