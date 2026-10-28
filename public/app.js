const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const api = async (path, opts = {}) => {
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...opts });
  const body = await res.json();
  if (!res.ok) throw new Error(body.erro || `HTTP ${res.status}`);
  return body;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STATUS = { rascunho: "Rascunho", aprovado: "Aprovado", ajustes: "Ajustes", recusado: "Recusado" };
let estado = { demandas: [], sel: null, estimado: false };

function layers(...on) {
  $$(".layer").forEach((l) => l.classList.toggle("on", on.includes(Number(l.dataset.layer))));
}

async function carregarEstado() {
  const e = await api("/api/estado");
  estado.estimado = e.llm.provider === "offline";
  $("#estado").innerHTML = [
    `LLM <b>${esc(e.llm.model)}</b>`,
    `embeddings <b>${esc(e.embeddings)}</b>`,
    `pgvector · <b>${esc(e.banco)}</b>`,
    `<b>OpenTelemetry</b>`,
  ].map((c) => `<span class="chip">${c}</span>`).join("");
}

async function carregarDemandas() {
  estado.demandas = await api("/api/demandas");
  $("#demandas").innerHTML = estado.demandas
    .map((d) => {
      const st = d.pre_esboco_status;
      return `<li class="item ${estado.sel === d.id ? "sel" : ""}" data-id="${esc(d.id)}">
        <div class="t">${esc(d.titulo)}</div>
        <div class="s"><span>${esc(d.setor)}</span><span class="badge ${st ?? ""}">${st ? STATUS[st] : "Nova"}</span></div>
      </li>`;
    })
    .join("");
  $$("#demandas .item").forEach((li) => li.addEventListener("click", () => selecionar(li.dataset.id)));
}

function renderDemanda(d) {
  return `<div class="panel demand">
    <div class="label">Demanda ${esc(d.id)} · recebida pelo formulário</div>
    <h1>${esc(d.titulo)}</h1>
    <div class="meta">${esc(d.setor)} · prazo desejado: ${esc(d.prazo_desejado || "não informado")}</div>
    <p><span class="label">Problema</span><br/>${esc(d.descricao)}</p>
    <p><span class="label">Objetivo</span><br/>${esc(d.objetivo)}</p>
    <div class="run-row">
      <button class="btn primary" id="gerar">Gerar pré-esboço com IA</button>
      <div class="steps" id="steps"></div>
    </div>
  </div>
  <div id="resultado"></div>`;
}

async function selecionar(id) {
  estado.sel = id;
  $$("#demandas .item").forEach((li) => li.classList.toggle("sel", li.dataset.id === id));
  const d = estado.demandas.find((x) => x.id === id);
  $("#detalhe").innerHTML = renderDemanda(d);
  $("#gerar").addEventListener("click", () => gerar(d));
  layers(1);
  if (d.pre_esboco_id) {
    const p = await api(`/api/pre-esbocos/${d.pre_esboco_id}`);
    renderResultado({
      preEsbocoId: p.id,
      preEsboco: p.conteudo,
      chunks: p.chunks.map((c) => ({ ...c, similarity: undefined })),
      status: p.status,
      execucao: p.execucao,
    });
  }
}

const PASSOS = ["Dados pessoais removidos", "Busca no pgvector", "Claude / gerador", "JSON Schema", "Fundamentação", "Salvo como rascunho"];

async function gerar(d) {
  const btn = $("#gerar");
  btn.disabled = true;
  btn.textContent = "Gerando…";
  layers(1, 2);
  $("#resultado").innerHTML = "";
  const steps = $("#steps");
  steps.innerHTML = PASSOS.map((p) => `<span class="step">${p}</span>`).join("");
  const req = api(`/api/demandas/${d.id}/pre-esboco`, { method: "POST" });
  for (const el of $$(".step", steps)) {
    el.classList.add("doing");
    await sleep(280);
    el.classList.replace("doing", "done");
  }
  try {
    const r = await req;
    renderResultado({ ...r, status: "rascunho" });
    await carregarDemandas();
  } catch (e) {
    $("#resultado").innerHTML = `<div class="empty">Falha: ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Gerar de novo";
  }
}

const list = (items) => (items?.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : `<p class="muted">—</p>`);

function renderResultado(r) {
  const p = r.preEsboco;
  if (!p) {
    $("#resultado").innerHTML = `<div class="empty">O rascunho não passou na validação: ${esc((r.erros || []).join("; "))}</div>`;
    return;
  }
  const citados = new Set(p.fontes.map((f) => f.chunk_id));
  const root = r.execucao;
  const a = root?.attributes ?? {};
  const guards = [
    [`${a["guardrail.pii.removidos"] ?? r.piiRemovidos ?? 0} dado(s) pessoal(is) removido(s)`, false],
    [a["captacao.schema_valido_1a"] === false ? "Schema válido após reparo" : "Schema válido na 1ª tentativa", a["captacao.schema_valido_1a"] === false],
    [a["captacao.fundamentado"] === false ? "Fonte fora do contexto" : "Fontes dentro do contexto", a["captacao.fundamentado"] === false],
    [`Confiança ${p.confianca}`, p.confianca === "baixa"],
  ];
  const chunks = (r.chunks || [])
    .map(
      (c) => `<div class="chunk ${citados.has(c.id) ? "cited" : ""}">
        <div class="h"><span class="id">${esc(c.id)}</span>${c.similarity != null ? `<span>${Number(c.similarity).toFixed(3)}</span>` : ""}</div>
        <div class="doc">${esc(c.titulo)} · ${esc(c.secao)}</div>
        <div class="txt">${esc(c.conteudo.split("\n").slice(1).join(" "))}</div>
        ${c.similarity != null ? `<div class="bar"><i style="width:${Math.max(4, Math.min(100, c.similarity * 160))}%"></i></div>` : ""}
      </div>`,
    )
    .join("");
  const historias = p.historias_sugeridas
    .map(
      (h) => `<div class="story">Como <b>${esc(h.como)}</b>, quero ${esc(h.quero)}, para ${esc(h.para)}.
        ${h.criterios.map((c) => `<div class="gwt">Dado ${esc(c.dado)}, quando ${esc(c.quando)}, então ${esc(c.entao)}.</div>`).join("")}</div>`,
    )
    .join("");
  const status = r.status || "rascunho";
  const meta = root
    ? `${Math.round(root.durationMs)} ms · ${a["gen_ai.usage.input_tokens"]}→${a["gen_ai.usage.output_tokens"]} tokens${a["gen_ai.usage.estimated"] ? " (est.)" : ""} · US$ ${Number(a["gen_ai.cost_usd"] ?? 0).toFixed(4)}`
    : "";
  $("#resultado").innerHTML = `<div class="result">
    <div class="panel">
      <div class="panel-head"><h2>Trechos recuperados (RAG)</h2><span class="muted">top ${r.chunks?.length ?? 0} · roxo = citado</span></div>
      ${chunks}
    </div>
    <div class="panel draft">
      <div class="panel-head"><h3>${esc(p.titulo)}</h3><span class="badge ${status}" id="status-badge">${STATUS[status]}</span></div>
      <div class="muted">${meta}</div>
      <div class="guards">${guards.map(([t, w]) => `<span class="guard ${w ? "warn" : ""}">${esc(t)}</span>`).join("")}</div>
      <div class="sec"><h4>Resumo</h4><p>${esc(p.resumo)}</p></div>
      <div class="sec"><h4>Escopo do MVP</h4>${list(p.escopo_mvp)}</div>
      <div class="sec"><h4>Histórias sugeridas</h4>${historias}</div>
      <div class="sec"><h4>Perguntas para a reunião de entendimento</h4>${list(p.perguntas_para_entendimento)}</div>
      <div class="sec"><h4>Projetos relacionados</h4>${list(p.projetos_relacionados.map((x) => `${x.titulo} — ${x.motivo}`))}</div>
      <div class="sec"><h4>Fontes</h4><p>${p.fontes.map((f) => `<span class="src">${esc(f.chunk_id)}</span>`).join(" ")}</p></div>
      <div class="triage" id="triage">
        <h2>Decisão humana</h2>
        <div class="muted">O agente nunca aprova. A equipe decide se o rascunho segue para a reunião de entendimento.</div>
        <textarea id="nota" rows="2" placeholder="Nota para o solicitante (opcional)"></textarea>
        <div class="actions">
          <button class="btn ok" data-d="aprovado">Aprovar para entendimento</button>
          <button class="btn warn" data-d="ajustes">Pedir ajustes</button>
          <button class="btn no" data-d="recusado">Recusar</button>
        </div>
      </div>
    </div>
  </div>`;
  layers(2, 3);
  $$("#triage [data-d]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/api/pre-esbocos/${r.preEsbocoId}/triagem`, {
        method: "POST",
        body: JSON.stringify({ decisao: b.dataset.d, nota: $("#nota").value }),
      });
      const badge = $("#status-badge");
      badge.className = `badge ${b.dataset.d}`;
      badge.textContent = STATUS[b.dataset.d];
      layers(3, 4);
      await carregarDemandas();
    }),
  );
}

/* ---------------- Observabilidade ---------------- */

const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

async function carregarObs() {
  const [m, execs] = await Promise.all([api("/api/metricas"), api("/api/execucoes")]);
  const est = m.tokens.estimados ? " (est.)" : "";
  $("#semana").textContent = `semana ${m.periodo}`;
  $("#kpis").innerHTML = [
    ["Execuções", m.execucoes, `${m.rascunhosGerados} rascunhos · ${m.falhasValidacao} falhas`],
    ["Latência p95", fmtMs(m.latenciaMs.p95), `média ${fmtMs(m.latenciaMs.media)}`],
    [`Tokens${est}`, `${m.tokens.entrada + m.tokens.saida}`, `${m.tokens.entrada} entrada · ${m.tokens.saida} saída`],
    [`Custo${est}`, `US$ ${m.custoUsd.total.toFixed(3)}`, `US$ ${m.custoUsd.medioPorExecucao.toFixed(4)} por execução`],
    ["Schema na 1ª tentativa", `${m.schemaValidoPrimeiraPct}%`, `${m.fundamentadosPct}% fundamentados`],
    ["Aceitos sem retrabalho", `${m.triagem.aceitosSemRetrabalhoPct}%`, `${m.triagem.total} triados`],
  ]
    .map(([l, v, n]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="n">${n}</div></div>`)
    .join("");
  $("#execucoes").innerHTML = execs
    .map((e, i) => {
      const a = e.attributes;
      return `<tr data-i="${i}">
        <td>${new Date(e.start).toLocaleTimeString("pt-BR")}</td>
        <td>${esc(a["captacao.demanda_id"])}</td>
        <td><span class="badge ${a["captacao.resultado"] === "rascunho_gerado" ? "aprovado" : "recusado"}">${a["captacao.resultado"] === "rascunho_gerado" ? "rascunho" : "falha"}</span></td>
        <td>${fmtMs(e.durationMs)}</td>
        <td>${a["gen_ai.usage.input_tokens"]}→${a["gen_ai.usage.output_tokens"]}</td>
        <td>US$ ${Number(a["gen_ai.cost_usd"]).toFixed(4)}</td>
        <td>${Number(a["rag.top_similarity"]).toFixed(3)}</td>
      </tr>`;
    })
    .join("");
  $$("#execucoes tr").forEach((tr) => tr.addEventListener("click", () => waterfall(execs[Number(tr.dataset.i)], tr)));
  if (execs[0]) waterfall(execs[0], $("#execucoes tr"));
}

function waterfall(exec, tr) {
  $$("#execucoes tr").forEach((x) => x.classList.toggle("sel", x === tr));
  $("#trace-id").textContent = `trace ${exec.traceId.slice(0, 12)}…`;
  const t0 = new Date(exec.start).getTime();
  const total = Math.max(exec.durationMs, 1);
  const kind = (n) => (n.startsWith("captacao") ? "root" : n.startsWith("gen_ai") ? "llm" : n.startsWith("rag") ? "rag" : n.startsWith("guardrail") ? "guard" : "");
  const rows = exec.spans
    .map((s) => {
      const left = ((new Date(s.start).getTime() - t0) / total) * 100;
      const width = (s.durationMs / total) * 100;
      return `<div class="span"><span class="name" title="${esc(s.name)}">${esc(s.name)}</span>
        <span class="track"><i class="${kind(s.name)}" style="left:${Math.max(0, Math.min(98, left))}%;width:${Math.max(1, Math.min(100, width))}%"></i></span>
        <span class="ms">${s.durationMs.toFixed(1)} ms</span></div>`;
    })
    .join("");
  const a = exec.attributes;
  const keys = ["gen_ai.system", "gen_ai.request.model", "gen_ai.usage.input_tokens", "gen_ai.usage.output_tokens", "gen_ai.cost_usd", "rag.top_similarity", "rag.chunk_ids", "captacao.tentativas", "captacao.fundamentado", "captacao.confianca"];
  $("#waterfall").innerHTML = `${rows}<dl class="attrs">${keys
    .filter((k) => a[k] !== undefined)
    .map((k) => `<dt>${k}</dt><dd>${esc(Array.isArray(a[k]) ? a[k].join(", ") : a[k])}</dd>`)
    .join("")}</dl>`;
}

/* ---------------- Navegação e formulário ---------------- */

$$(".tab").forEach((t) =>
  t.addEventListener("click", async () => {
    $$(".tab").forEach((x) => {
      x.classList.toggle("active", x === t);
      x.setAttribute("aria-selected", String(x === t));
    });
    $$(".view").forEach((v) => v.classList.toggle("hidden", v.id !== t.dataset.tab));
    if (t.dataset.tab === "obs") {
      layers(4);
      await carregarObs();
    }
  }),
);

$("#nova").addEventListener("click", () => $("#form-dialog").showModal());
$("#form").addEventListener("submit", async (ev) => {
  if (ev.submitter?.value !== "ok") return;
  const data = Object.fromEntries(new FormData(ev.target));
  const d = await api("/api/demandas", { method: "POST", body: JSON.stringify(data) });
  ev.target.reset();
  await carregarDemandas();
  await selecionar(d.id);
});

await carregarEstado();
await carregarDemandas();
if (estado.demandas[0]) await selecionar(estado.demandas[0].id);
