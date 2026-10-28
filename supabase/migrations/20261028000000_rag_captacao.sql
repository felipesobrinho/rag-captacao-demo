-- Captação de Projetos — schema do demo (compatível com Supabase e com PGlite)
-- A dimensão 512 precisa bater com o provedor de embeddings (local ou OpenAI com dimensions=512).

create extension if not exists vector;

-- Biblioteca de Projetos: documentos homologados e documentos-modelo
create table if not exists documentos (
  id          text primary key,
  titulo      text not null,
  tipo        text not null check (tipo in ('projeto', 'modelo')),
  caminho     text not null,
  hash        text not null,
  criado_em   timestamptz not null default now()
);

create table if not exists chunks (
  id            text primary key,
  documento_id  text not null references documentos(id) on delete cascade,
  ordem         int  not null,
  secao         text not null,
  conteudo      text not null,
  tokens        int  not null,
  embedding     vector(512) not null
);

create index if not exists chunks_embedding_hnsw
  on chunks using hnsw (embedding vector_cosine_ops);

-- Busca semântica no padrão de RPC do Supabase: supabase.rpc('match_chunks', {...})
create or replace function match_chunks(
  query_embedding vector(512),
  match_count     int   default 6,
  min_similarity  float default 0
)
returns table (
  id            text,
  documento_id  text,
  titulo        text,
  secao         text,
  conteudo      text,
  similarity    float
)
language sql stable
as $$
  select c.id, c.documento_id, d.titulo, c.secao, c.conteudo,
         1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documentos d on d.id = c.documento_id
  where 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count
$$;

-- Entrada: cada resposta do formulário vira uma demanda (no real: item de lista do SharePoint)
create table if not exists demandas (
  id                text primary key,
  titulo            text not null,
  setor             text not null,
  descricao         text not null,
  objetivo          text not null,
  prazo_desejado    text,
  origem            text not null default 'formulario',
  criado_em         timestamptz not null default now()
);

-- Saída do agente: sempre nasce como rascunho
create table if not exists pre_esbocos (
  id            text primary key,
  demanda_id    text not null references demandas(id) on delete cascade,
  status        text not null default 'rascunho'
                check (status in ('rascunho', 'aprovado', 'ajustes', 'recusado')),
  conteudo      jsonb not null,
  chunk_ids     jsonb not null,
  modelo        text not null,
  trace_id      text not null,
  criado_em     timestamptz not null default now()
);

-- Decisão humana da equipe de TI (no real: triagem no Teams)
create table if not exists triagens (
  id              text primary key,
  pre_esboco_id   text not null references pre_esbocos(id) on delete cascade,
  decisao         text not null check (decisao in ('aprovado', 'ajustes', 'recusado')),
  nota            text,
  decidido_em     timestamptz not null default now()
);

-- No Supabase, o acesso acontece só pelo servidor; RLS ligado e sem políticas públicas.
alter table documentos  enable row level security;
alter table chunks      enable row level security;
alter table demandas    enable row level security;
alter table pre_esbocos enable row level security;
alter table triagens    enable row level security;
