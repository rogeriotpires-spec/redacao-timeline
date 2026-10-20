/* Comum a todas as páginas internas: usuário logado, menu (trocar senha, administração, sair),
   ações da redação (dispara rotinas pelo servidor, com a sessão) e acompanhamento do andamento. */
window.Painel = (() => {
  const API = true;
  let CLI = null, EU = null;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  async function req(path, opt = {}) {
    const r = await fetch(path, { credentials: "same-origin", cache: "no-store", ...opt, headers: { "Content-Type": "application/json", ...(opt.headers || {}) } });
    if (r.status === 401) { location.href = "/login.html?next=" + encodeURIComponent(location.pathname + location.search + location.hash); throw new Error("Sessão expirada.") }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
    return j;
  }
  /* compatível com as páginas herdadas: call("/run",{job}), call("/avulso",{...}), call("/acao",{job,payload}) */
  async function call(path, data = {}) {
    if (path === "/run") return req("/api/acao", { method: "POST", body: JSON.stringify({ job: data.job }) });
    if (path === "/avulso") return req("/api/acao", { method: "POST", body: JSON.stringify({ job: "avulso", payload: data }) });
    if (path === "/acao") return req("/api/acao", { method: "POST", body: JSON.stringify({ job: data.job, payload: typeof data.payload === "string" ? JSON.parse(data.payload) : data.payload }) });
    throw new Error("Ação indisponível.");
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const lastRun = wf => req("/api/status?wf=" + encodeURIComponent(wf)).catch(() => null);
  async function track({ wf, since, stamp, say, minutes = 15, labels = {}, after }) {
    const base = await stamp().catch(() => null), t0 = Date.now();
    let finished = false;
    while (Date.now() - t0 < minutes * 60e3) {
      await sleep(finished ? 10000 : 20000);
      if (!finished) {
        const run = await lastRun(wf);
        if (!run || !run.created_at || new Date(run.created_at) < since) { say(labels.wait || "Na fila…"); continue }
        if (run.status !== "completed") { say(labels.running || "Em andamento…"); continue }
        if (run.conclusion !== "success") { say("Não deu certo desta vez. Tente de novo em alguns minutos."); return false }
        finished = true;
      }
      say("Pronto. Publicando…");
      const s = await stamp().catch(() => null);
      if (s && s !== base) { say("Atualizado! Recarregando…"); await sleep(800); if (after) after(); location.reload(); return true }
    }
    say("Está demorando mais que o normal. Recarregue a página em alguns minutos.");
    return false;
  }
  function wire({ btn, st, job, wf, stamp, minutes, labels, after }) {
    if (!btn) return;
    const say = t => { if (st) st.textContent = t };
    btn.onclick = async () => {
      const since = new Date(Date.now() - 90e3);
      btn.disabled = true;
      try {
        say("Enviando…");
        const j = await call("/run", { job });
        say(j.already ? "Já estava em andamento. Acompanhando…" : (labels && labels.running) || "Em andamento…");
        await track({ wf, since, stamp, say, minutes, labels, after });
      } catch (e) { say(e.message) }
      btn.disabled = false;
    };
    lastRun(wf).then(run => {
      if (run && run.status && run.status !== "completed" && Date.now() - new Date(run.created_at) < (minutes || 15) * 60e3) {
        btn.disabled = true; say((labels && labels.running) || "Em andamento…");
        track({ wf, since: new Date(run.created_at), stamp, say, minutes, labels, after }).then(() => { btn.disabled = false });
      }
    });
  }

  /* menu do usuário no canto da navegação */
  /* menu do usuário: o botão fica na navegação; a janela vai para o <body> (a barra de abas tem rolagem
     lateral e cortava a janela no celular). No celular ela abre como painel na base da tela. */
  function menu() {
    const host = document.querySelector(".nav-in .tabs");
    if (!host || !EU) return;
    if ((EU.papel === "admin" || EU.operador) && !host.querySelector('a[href$="consumo.html"]')) { const t = document.createElement("a"); t.href = "consumo.html"; t.textContent = "Consumo"; host.appendChild(t) }
    const w = document.createElement("div"); w.className = "umenu";
    w.innerHTML = `<button type="button" class="ubtn" aria-haspopup="menu" aria-expanded="false">${esc(EU.nome.split(" ")[0])} ▾</button>`;
    host.appendChild(w);
    const fundo = document.createElement("div"); fundo.className = "ufundo"; fundo.hidden = true;
    const pop = document.createElement("div"); pop.className = "upop"; pop.hidden = true; pop.setAttribute("role", "menu");
    pop.innerHTML = `<div class="uhead"><b>${esc(EU.nome)}</b><small>${esc(EU.login)} · ${EU.operador ? "operador" : EU.papel === "admin" ? "administrador" : "redação"}</small></div>
      ${(EU.papel === "admin" || EU.operador) ? `<a href="/consumo.html" role="menuitem">📊 Consumo</a><a href="/configuracoes.html" role="menuitem">⚙️ Configurações</a><a href="/admin.html" role="menuitem">👥 Usuários</a>` : ""}<button type="button" data-u="senha" role="menuitem">🔑 Trocar senha</button><button type="button" data-u="sair" role="menuitem">↩︎ Sair</button>`;
    document.body.append(fundo, pop);
    const btn = w.querySelector(".ubtn");
    const fecha = () => { pop.hidden = fundo.hidden = true; btn.setAttribute("aria-expanded", "false") };
    const abre = () => {
      const celular = matchMedia("(max-width: 640px)").matches;
      pop.classList.toggle("sheet", celular); fundo.hidden = !celular;
      if (!celular) { const r = btn.getBoundingClientRect(); pop.style.top = (r.bottom + 6) + "px"; pop.style.left = Math.max(8, Math.min(r.left, innerWidth - 248)) + "px" }
      else pop.style.top = pop.style.left = "";
      pop.hidden = false; btn.setAttribute("aria-expanded", "true");
    };
    btn.onclick = e => { e.stopPropagation(); pop.hidden ? abre() : fecha() };
    fundo.onclick = fecha;
    document.addEventListener("click", e => { if (!pop.contains(e.target)) fecha() });
    document.addEventListener("keydown", e => { if (e.key === "Escape") fecha() });
    addEventListener("scroll", () => { if (!pop.classList.contains("sheet")) fecha() }, { passive: true });
    pop.querySelector('[data-u="sair"]').onclick = async () => { await fetch("/api/logout", { method: "POST" }); location.href = "/login.html" };
    pop.querySelector('[data-u="senha"]').onclick = () => { fecha(); trocaSenha(false) };
  }
  function trocaSenha(obrigatoria) {
    const d = document.createElement("div"); d.className = "modal";
    d.innerHTML = `<form class="mbox"><h3>${obrigatoria ? "Crie a sua senha" : "Trocar senha"}</h3>${obrigatoria ? `<p class="small-n">Por segurança, troque a senha provisória que você recebeu.</p>` : ""}
      <label>Senha atual<input type="password" name="atual" autocomplete="current-password" required></label>
      <label>Nova senha (mínimo 8 caracteres)<input type="password" name="nova" autocomplete="new-password" minlength="8" required></label>
      <label>Repita a nova senha<input type="password" name="nova2" autocomplete="new-password" minlength="8" required></label>
      <p class="merr" role="alert"></p><div class="mact">${obrigatoria ? "" : `<button type="button" class="btn ghost" data-x>Cancelar</button>`}<button class="btn">Salvar</button></div></form>`;
    document.body.appendChild(d);
    const f = d.querySelector("form"), err = d.querySelector(".merr");
    const x = d.querySelector("[data-x]"); if (x) x.onclick = () => d.remove();
    f.onsubmit = async e => {
      e.preventDefault(); err.textContent = "";
      if (f.nova.value !== f.nova2.value) { err.textContent = "As senhas novas não são iguais."; return }
      try { await req("/api/senha", { method: "POST", body: JSON.stringify({ atual: f.atual.value, nova: f.nova.value }) }); d.remove(); toast("Senha trocada.") }
      catch (e2) { err.textContent = e2.message }
    };
  }
  function toast(t) { const e = document.getElementById("toast"); if (!e) return alert(t); e.textContent = t; e.classList.add("on"); setTimeout(() => e.classList.remove("on"), 1800) }

  const pronto = (async () => {
    [CLI, EU] = await Promise.all([fetch("/cliente.json", { cache: "no-store" }).then(r => r.json()).catch(() => ({})), req("/api/me").catch(() => null)]);
    const k = CLI.cores || (CLI.cor ? { primaria: CLI.cor } : null), R = document.documentElement.style;
    if (k) { const v = { "--marca": k.primaria, "--marca-esc": k.escura, "--acento": k.acento, "--destaque": k.destaque, "--sobre-destaque": k.sobre_destaque }; for (const n in v) if (v[n]) R.setProperty(n, v[n]) }
    document.querySelectorAll("[data-cli]").forEach(el => { const k = el.dataset.cli; if (CLI[k] != null) el.textContent = Array.isArray(CLI[k]) ? CLI[k].join(", ") : CLI[k] });
    const ap = document.getElementById("apres"), L = (CLI.apresentadores || []).filter(Boolean);
    if (ap) ap.textContent = L.length ? ` Apresentação: ${L.length > 1 ? L.slice(0, -1).join(", ") + " e " + L.at(-1) : L[0]}.` : "";
    if (document.readyState === "loading") await new Promise(r => document.addEventListener("DOMContentLoaded", r));
    menu();
    const who = document.querySelector(".hero .who");
    if (CLI.logo && who && !who.querySelector(".hlogo")) { const im = new Image(); im.className = "hlogo"; im.alt = CLI.veiculo || ""; im.src = "/" + CLI.logo.replace(/^\//, "") + "?v=" + (CLI.versao || ""); im.onerror = () => im.remove(); who.prepend(im) }
    if (EU && EU.troca_senha) trocaSenha(true);
    return { cliente: CLI, usuario: EU };
  })();

  /* dia da pauta do programa que recebe um item: hoje até a "virada"; depois, o próximo dia de programa */
  function progDay() {
    const dias = (CLI && CLI.dias) || [1, 2, 3, 4, 5], virada = (CLI && CLI.virada_hora) || 14;
    const n = new Date(Date.now() - 3 * 36e5); let d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
    if (n.getUTCHours() >= virada) d.setUTCDate(d.getUTCDate() + 1);
    for (let k = 0; k < 8 && !dias.includes(d.getUTCDay()); k++) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  return { API, call, track, wire, lastRun, pronto, progDay, toast, esc, get cliente() { return CLI }, get usuario() { return EU } };
})();
