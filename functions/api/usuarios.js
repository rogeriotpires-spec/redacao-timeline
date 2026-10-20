// Administração de usuários (só papel admin; o porteiro já confere).
import { json, listaUsuarios, getUsuario, putUsuario, delUsuario, hashSenha, publico, loginValido, senhaValida } from "../../lib/auth.js";
const ehOp = (u, data) => u.papel === "operador" || (data.plano.operadores || []).includes(u.login);
const papelDe = (v, data) => v === "operador" && data.operador ? "operador" : v === "admin" ? "admin" : "redacao";
export async function onRequestGet({ env, data }) {
  // o administrador do cliente não vê nem mexe na conta do operador
  const L = (await listaUsuarios(env)).filter(u => data.operador || !ehOp(u, data)).map(u => ({ ...publico(u), papel: ehOp(u, data) ? "operador" : u.papel })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return json({ usuarios: L });
}
export async function onRequestPost({ request, env, data }) {
  const b = await request.json().catch(() => ({})), acao = b.acao, login = String(b.login || "").trim().toLowerCase();
  if (acao === "criar") {
    if (!loginValido(login)) return json({ error: "Login: 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado." }, 400);
    if (await getUsuario(env, login)) return json({ error: "Esse login já existe." }, 400);
    if (!senhaValida(b.senha)) return json({ error: "A senha precisa ter pelo menos 8 caracteres." }, 400);
    await putUsuario(env, { login, nome: String(b.nome || login).slice(0, 80), papel: papelDe(b.papel, data), ativo: true, versao: 1, troca_senha: true, criado: new Date().toISOString(), criado_por: data.usuario.login, ...(await hashSenha(b.senha)) });
    return json({ ok: true });
  }
  const u = await getUsuario(env, login);
  if (!u || (!data.operador && ehOp(u, data))) return json({ error: "Usuário não encontrado." }, 404);
  const outrosAdmins = (await listaUsuarios(env)).filter(x => (x.papel === "admin" || ehOp(x, data)) && x.ativo !== false && x.login !== login).length;
  if (acao === "senha") {
    if (!senhaValida(b.senha)) return json({ error: "A senha precisa ter pelo menos 8 caracteres." }, 400);
    Object.assign(u, await hashSenha(b.senha)); u.versao = (u.versao || 1) + 1; u.troca_senha = true;
  } else if (acao === "bloquear" || acao === "desbloquear") {
    if (acao === "bloquear" && u.papel === "admin" && !outrosAdmins) return json({ error: "Não dá para bloquear o único administrador." }, 400);
    u.ativo = acao === "desbloquear"; u.versao = (u.versao || 1) + 1;
  } else if (acao === "papel") {
    if (u.papel === "admin" && b.papel !== "admin" && !outrosAdmins) return json({ error: "Precisa existir pelo menos um administrador." }, 400);
    u.papel = papelDe(b.papel, data);
  } else if (acao === "remover") {
    if (login === data.usuario.login) return json({ error: "Você não pode remover a si mesmo." }, 400);
    if (u.papel === "admin" && !outrosAdmins) return json({ error: "Não dá para remover o único administrador." }, 400);
    await delUsuario(env, login); return json({ ok: true });
  } else return json({ error: "Ação desconhecida." }, 400);
  await putUsuario(env, u);
  return json({ ok: true });
}
