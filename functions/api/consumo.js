// Aba Consumo (só administrador; o porteiro confere): histórico de gerações com custo e o controle da geração.
import { json } from "../../lib/auth.js";
import { leJson, commit, b64enc } from "../../lib/github.js";
const PADRAO = { estado: "manual", orcamento_mensal_usd: 0, modelos: { noticias: "economico", programa: "equilibrado", avulso: "equilibrado" } };
const NIVEIS = new Set(["economico", "equilibrado", "maximo"]);
export async function onRequestGet({ env }) {
  try {
    const [c, h] = await Promise.all([leJson(env, "controle.json", {}), leJson(env, "historico/consumo.json", { execucoes: [] })]);
    return json({ controle: { ...PADRAO, ...c.dados, modelos: { ...PADRAO.modelos, ...(c.dados.modelos || {}) } }, sha: c.sha, historico: h.dados });
  } catch (e) { return json({ error: e.message }, 502) }
}
export async function onRequestPost({ request, env, data }) {
  const b = await request.json().catch(() => ({}));
  try {
    const atual = await leJson(env, "controle.json", {});
    if (atual.sha && b.sha && b.sha !== atual.sha) return json({ error: "Outra pessoa mudou o controle agora há pouco. Recarregue a página." }, 409);
    const c = { ...PADRAO, ...atual.dados };
    if (b.estado !== undefined) { if (!["ativo", "manual", "pausado"].includes(b.estado)) return json({ error: "Estado inválido." }, 400); c.estado = b.estado }
    if (b.orcamento_mensal_usd !== undefined) { const v = Number(b.orcamento_mensal_usd); if (!(v >= 0 && v <= 100000)) return json({ error: "Orçamento inválido." }, 400); c.orcamento_mensal_usd = Math.round(v * 100) / 100 }
    if (b.modelos) { c.modelos = { ...PADRAO.modelos, ...(c.modelos || {}) }; for (const k of ["noticias", "programa", "avulso"]) if (b.modelos[k] !== undefined) { if (!NIVEIS.has(b.modelos[k])) return json({ error: "Modelo inválido." }, 400); c.modelos[k] = b.modelos[k] } }
    c.alterado = { por: data.usuario.login, em: new Date().toISOString() };
    await commit(env, [{ path: "controle.json", b64: b64enc(JSON.stringify(c, null, 2) + "\n") }], `Controle de geração: ${c.estado} (por ${data.usuario.login})`);
    const novo = await leJson(env, "controle.json", {});
    return json({ ok: true, controle: c, sha: novo.sha });
  } catch (e) { return json({ error: e.message }, 502) }
}
