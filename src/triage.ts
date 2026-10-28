import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import { withSpan } from "./telemetry.js";
import type { Decisao } from "./types.js";

export const DECISOES: Decisao[] = ["aprovado", "ajustes", "recusado"];

/**
 * Decisão humana da equipe de TI sobre um rascunho. "aprovado" segue para a reunião
 * de entendimento; "ajustes" volta com pedido de correção; "recusado" encerra.
 */
export async function registrarTriagem(db: Db, preEsbocoId: string, decisao: Decisao, nota = "") {
  if (!DECISOES.includes(decisao)) throw new Error(`Decisão inválida: ${decisao}`);
  return withSpan("triagem.decisao", { "captacao.pre_esboco_id": preEsbocoId, "triagem.decisao": decisao }, async () => {
    const found = await db.query<{ id: string }>("select id from pre_esbocos where id = $1", [preEsbocoId]);
    if (!found.rows.length) throw new Error("Pré-esboço não encontrado");
    const id = randomUUID();
    await db.query("insert into triagens (id, pre_esboco_id, decisao, nota) values ($1, $2, $3, $4)", [
      id,
      preEsbocoId,
      decisao,
      nota || null,
    ]);
    await db.query("update pre_esbocos set status = $2 where id = $1", [preEsbocoId, decisao]);
    return { id, preEsbocoId, decisao };
  });
}

export interface TriagemRow {
  pre_esboco_id: string;
  decisao: Decisao;
  decidido_em: string;
}

export async function listarTriagens(db: Db): Promise<TriagemRow[]> {
  const { rows } = await db.query<TriagemRow>("select pre_esboco_id, decisao, decidido_em from triagens order by decidido_em");
  return rows.map((r) => ({ ...r, decidido_em: new Date(r.decidido_em).toISOString() }));
}
