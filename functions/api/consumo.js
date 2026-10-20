// Aba Consumo (administrador do cliente e operador; o porteiro confere).
// Administrador: vê o plano, o uso do mês e o histórico (sem valores) e pode pausar ou suspender a geração.
// Operador: vê também os custos, escolhe os modelos, o orçamento, troca o plano e libera extras.
import { json } from "../../lib/auth.js";
import { leJson, commit, b64enc } from "../../lib/github.js";
import { CATALOGO, ROTINAS, limites, usoDoMes, mesBR } from "../../lib/plano.js";
const PADRAO = { estado: "manual", orcamento_mensal_usd: 0, modelos: { noticias: "economico", programa: "equilibrado", avulso: "equilibrado" } };
const NIVEIS = new Set(["economico", "equilibrado", "maximo"]);
const SEM_CUSTO = e => { const { custo_usd, tokens, execucao_url, modelos, modelo_escolhido, turnos, buscas_web, duracao_claude_s, ...r } = e; return r };
const catalogo = () => Object.fromEntries(Object.entries(CATALOGO).filter(([k]) => !k.startsWith("_")).map(([k, v]) => [k, { nome: v.nome, preco_brl: v.preco_brl, edicoes_dia: v.edicoes_dia, regional: v.regional, limites: v.limites, resumo: v.resumo }]));

export async function onRequestGet({ env, data }) {
  try {
    const [c, h] = await Promise.all([leJson(env, "controle.json", {}), leJson(env, "historico/consumo.json", { execucoes: [] })]);
    const P = data.plano, ex = h.dados.execucoes || [];
    const resp = {
      operador: data.operador, sha: c.sha, mes: mesBR(),
      controle: { ...PADRAO, ...c.dados, modelos: { ...PADRAO.modelos, ...(c.dados.modelos || {}) } },
      plano: { id: P.id, nome: P.nome, resumo: P.resumo, edicoes_dia: P.edicoes_dia, regional: P.regional, limites: limites(P), base: P.limites, extras: P.extras[mesBR()] || {}, contato: P.contato },
      uso: usoDoMes(ex),
      historico: { execucoes: data.operador ? ex : ex.map(SEM_CUSTO) }
    };
    if (!data.operador) { delete resp.controle.modelos; delete resp.controle.orcamento_mensal_usd }
    else resp.catalogo = catalogo();
    return json(resp);
  } catch (e) { return json({ error: e.message }, 502) }
}

export async function onRequestPost({ request, env, data }) {
  const b = await request.json().catch(() => ({}));
  const so = campo => { if (!data.operador) throw Object.assign(new Error(`Só o operador altera ${campo}.`), { status: 403 }) };
  try {
    const arquivos = [];
    const atual = await leJson(env, "controle.json", {});
    if (atual.sha && b.sha && b.sha !== atual.sha) return json({ error: "Outra pessoa mudou o controle agora há pouco. Recarregue a página." }, 409);
    const c = { ...PADRAO, ...atual.dados };
    let mudouControle = false;
    if (b.estado !== undefined) { if (!["ativo", "manual", "pausado"].includes(b.estado)) return json({ error: "Estado inválido." }, 400); c.estado = b.estado; mudouControle = true }
    if (b.orcamento_mensal_usd !== undefined) { so("o orçamento"); const v = Number(b.orcamento_mensal_usd); if (!(v >= 0 && v <= 100000)) return json({ error: "Orçamento inválido." }, 400); c.orcamento_mensal_usd = Math.round(v * 100) / 100; mudouControle = true }
    if (b.modelos) { so("os modelos"); c.modelos = { ...PADRAO.modelos, ...(c.modelos || {}) }; for (const k of ROTINAS) if (b.modelos[k] !== undefined) { if (!NIVEIS.has(b.modelos[k])) return json({ error: "Modelo inválido." }, 400); c.modelos[k] = b.modelos[k] } mudouControle = true }
    if (mudouControle) { c.alterado = { por: data.usuario.login, em: new Date().toISOString() }; arquivos.push({ path: "controle.json", b64: b64enc(JSON.stringify(c, null, 2) + "\n") }) }
    let msg = `Controle de geração: ${c.estado}`;
    if (b.plano) {
      so("o plano");
      const pa = (await leJson(env, "plano.json", {})).dados || {};
      const n = { plano: pa.plano || "profissional", operadores: pa.operadores || [], extras: pa.extras || {}, contato: pa.contato || "" };
      if (b.plano.id !== undefined) { if (!CATALOGO[b.plano.id] || b.plano.id.startsWith("_")) return json({ error: "Plano inválido." }, 400); n.plano = b.plano.id }
      if (b.plano.extras) {
        const mes = /^\d{4}-\d{2}$/.test(b.plano.mes || "") ? b.plano.mes : mesBR();
        const e = {}; for (const r of ROTINAS) { const v = parseInt(b.plano.extras[r], 10); if (v > 0 && v <= 10000) e[r] = v }
        if (Object.keys(e).length) n.extras[mes] = e; else delete n.extras[mes];
      }
      if (b.plano.contato !== undefined) n.contato = String(b.plano.contato).replace(/[\u0000-\u001f]/g, " ").slice(0, 160);
      arquivos.push({ path: "plano.json", b64: b64enc(JSON.stringify(n, null, 2) + "\n") });
      msg = `Plano do cliente: ${CATALOGO[n.plano].nome}`;
    }
    if (!arquivos.length) return json({ error: "Nada para salvar." }, 400);
    await commit(env, arquivos, `${msg} (por ${data.usuario.login})`);
    const novo = await leJson(env, "controle.json", {});
    return json({ ok: true, controle: c, sha: novo.sha });
  } catch (e) { return json({ error: e.message }, e.status || 502) }
}
