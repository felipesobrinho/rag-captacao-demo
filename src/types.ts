export interface Demanda {
  id: string;
  titulo: string;
  setor: string;
  descricao: string;
  objetivo: string;
  prazo_desejado?: string | null;
}

export interface RetrievedChunk {
  id: string;
  documento_id: string;
  titulo: string;
  secao: string;
  conteudo: string;
  similarity: number;
}

export interface HistoriaSugerida {
  como: string;
  quero: string;
  para: string;
  criterios: { dado: string; quando: string; entao: string }[];
}

export interface PreEsboco {
  titulo: string;
  status: "rascunho";
  resumo: string;
  problema: string;
  objetivos: string[];
  escopo_mvp: string[];
  fora_do_escopo: string[];
  historias_sugeridas: HistoriaSugerida[];
  integracoes_possiveis: string[];
  riscos: string[];
  perguntas_para_entendimento: string[];
  projetos_relacionados: { documento_id: string; titulo: string; motivo: string }[];
  fontes: { chunk_id: string; uso: string }[];
  lacunas: string[];
  confianca: "baixa" | "media" | "alta";
}

export type Decisao = "aprovado" | "ajustes" | "recusado";
