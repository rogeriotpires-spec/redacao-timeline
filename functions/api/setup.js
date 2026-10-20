// Cria o PRIMEIRO usuário, que é o operador (quem implanta o produto); ele cria depois o administrador do cliente. Só funciona enquanto não existe nenhum usuário e exige o SETUP_TOKEN do projeto.
import { json, listaUsuarios, hashSenha, putUsuario, loginValido, senhaValida } from "../../lib/auth.js";
export async function onRequestPost({ request, env }) {
  if (!env.SETUP_TOKEN) return json({ error: "Instalação já concluída." }, 403);
  if ((await listaUsuarios(env)).length) return json({ error: "Já existe administrador. Entre pela tela de login." }, 403);
  const b = await request.json().catch(() => ({}));
  if (String(b.token || "") !== env.SETUP_TOKEN) return json({ error: "Código de instalação incorreto." }, 401);
  const login = String(b.login || "").trim().toLowerCase();
  if (!loginValido(login)) return json({ error: "Login: 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado." }, 400);
  if (!senhaValida(b.senha)) return json({ error: "A senha precisa ter pelo menos 8 caracteres." }, 400);
  await putUsuario(env, { login, nome: String(b.nome || login).slice(0, 80), papel: "operador", ativo: true, versao: 1, criado: new Date().toISOString(), ...(await hashSenha(b.senha)) });
  return json({ ok: true });
}
