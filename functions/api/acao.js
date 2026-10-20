// Ações da redação: dispara as rotinas no GitHub do cliente com o token guardado na Cloudflare (nunca no navegador).
import { json } from "../../lib/auth.js";
import { leJson } from "../../lib/github.js";
const JOBS = { noticias: "noticias.yml", programa: "programa.yml", avulso: "programa-avulso.yml", excluir: "pauta-excluir.yml" };
const gh = (env, path, init = {}) => fetch(`${env.GH_API || "https://api.github.com"}/repos/${env.GH_REPO}${path}`, { ...init, headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "redacao-inteligente", "Content-Type": "application/json" } });
export async function onRequestPost({ request, env, data }) {
  const b = await request.json().catch(() => ({})), wf = JOBS[b.job];
  if (!wf) return json({ error: "Ação desconhecida." }, 400);
  // controle da geração (aba Consumo): pausado ou orçamento estourado barram já aqui, com aviso claro
  if (b.job !== "excluir") {
    const c = (await leJson(env, "controle.json", {}).catch(() => ({ dados: {} }))).dados || {};
    if (c.estado === "pausado") return json({ error: "A geração está pausada pelo administrador (aba Consumo)." }, 423);
    const orc = Number(c.orcamento_mensal_usd) || 0;
    if (orc > 0) {
      const h = (await leJson(env, "historico/consumo.json", { execucoes: [] }).catch(() => ({ dados: { execucoes: [] } }))).dados;
      const mes = new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 7);
      const gasto = (h.execucoes || []).filter(e => String(e.inicio || "").startsWith(mes)).reduce((a, e) => a + (e.custo_usd || 0), 0);
      if (gasto >= orc) return json({ error: `O orçamento do mês (US$ ${orc.toFixed(2)}) foi atingido. O administrador pode ajustá-lo na aba Consumo.` }, 423);
    }
  }
  let inputs;
  if (b.job === "avulso") {
    const p = b.payload || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.data || "") || !String(p.pedido || "").trim()) return json({ error: "Informe a data e o assunto." }, 400);
    inputs = { payload: JSON.stringify({ data: p.data, pedido: String(p.pedido).slice(0, 1500), obs: String(p.obs || "").slice(0, 1500), usuario: data.usuario.login }) };
  } else if (b.job === "excluir") {
    const p = b.payload || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.data || "") || !String(p.titulo || "").trim()) return json({ error: "Item inválido." }, 400);
    inputs = { payload: JSON.stringify({ tipo: "programa", data: p.data, titulo: String(p.titulo).slice(0, 300), usuario: data.usuario.login }) };
  } else {
    inputs = { usuario: data.usuario.login };
    const r = await gh(env, `/actions/workflows/${wf}/runs?per_page=1`);
    const last = r.ok ? ((await r.json()).workflow_runs || [])[0] : null;
    if (last && last.status !== "completed") return json({ ok: true, already: true, started: last.created_at });
  }
  const d = await gh(env, `/actions/workflows/${wf}/dispatches`, { method: "POST", body: JSON.stringify(inputs ? { ref: "main", inputs } : { ref: "main" }) });
  if (d.status === 204) return json({ ok: true, started: new Date().toISOString() });
  return json({ error: `O GitHub respondeu ${d.status}. Tente de novo em alguns minutos.` }, 502);
}
