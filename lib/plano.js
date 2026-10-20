// Plano contratado pelo cliente (plano.json, publicado junto com o site e lido pelo próprio servidor)
// e o catálogo de planos (lib/planos.json). Só o operador (quem vende e implanta) altera o plano.
import CATALOGO from "./planos.json";
export { CATALOGO };
export const ROTINAS = ["noticias", "programa", "avulso"];
export async function lePlano(env, request) {
  let p = {};
  try { const r = await env.ASSETS.fetch(new Request(new URL("/plano.json", request.url))); if (r.ok) p = await r.json() } catch (e) {}
  const def = CATALOGO[p.plano] || CATALOGO.profissional;
  return { id: CATALOGO[p.plano] ? p.plano : "profissional", ...def, operadores: p.operadores || [], extras: p.extras || {}, contato: p.contato || "" };
}
export const mesBR = () => new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 7);
// limite do mês = limite do plano + extras liberados para aquele mês
export function limites(plano, mes = mesBR()) {
  const ex = plano.extras[mes] || {};
  return Object.fromEntries(ROTINAS.map(r => [r, (plano.limites[r] || 0) + (Number(ex[r]) || 0)]));
}
export function usoDoMes(execucoes, mes = mesBR()) {
  const u = { noticias: 0, programa: 0, avulso: 0 };
  for (const e of execucoes || []) if (String(e.inicio || "").startsWith(mes) && e.resultado === "sucesso" && u[e.rotina] !== undefined) u[e.rotina]++;
  return u;
}
export const ehOperador = (u, plano) => !!u && (u.papel === "operador" || (plano.operadores || []).includes(u.login));
