// Configurações do cliente (só administrador; o porteiro confere).
// Lê e grava cliente.json e marca/logo.png no repositório do cliente. Cada gravação dispara,
// no GitHub, a rotina que recalcula fontes e horários e publica o painel de novo.
import { json } from "../../lib/auth.js";
import { validaConfig, validaLogo } from "../../lib/config.js";
import { le, commit, b64dec, b64enc } from "../../lib/github.js";
export async function onRequestGet({ env }) {
  try {
    const f = await le(env, "cliente.json");
    if (!f) return json({ error: "cliente.json não encontrado no repositório." }, 404);
    return json({ cliente: JSON.parse(b64dec(f.content)), sha: f.sha });
  } catch (e) { return json({ error: e.message }, 502) }
}
export async function onRequestPost({ request, env, data }) {
  const b = await request.json().catch(() => ({}));
  try {
    const f = await le(env, "cliente.json");
    const atual = f ? JSON.parse(b64dec(f.content)) : {};
    if (f && b.sha && b.sha !== f.sha) return json({ error: "Alguém salvou as configurações depois que você abriu a página. Recarregue e confira antes de salvar." }, 409);
    const { config, erros } = validaConfig(b.cliente, atual, data.plano);
    if (erros.length) return json({ error: erros.join(" ") }, 400);
    const quem = data.usuario.login, arquivos = [];
    if (b.logo) {
      const L = validaLogo(b.logo);
      if (L.erro) return json({ error: L.erro }, 400);
      arquivos.push({ path: "marca/logo.png", b64: L.b64 });
      config.marca.logo = "marca/logo.png";
    }
    arquivos.unshift({ path: "cliente.json", b64: b64enc(JSON.stringify(config, null, 2) + "\n") });
    await commit(env, arquivos, `Configurações atualizadas por ${quem}`);
    const g = await le(env, "cliente.json");
    return json({ ok: true, sha: g && g.sha });
  } catch (e) { return json({ error: e.message }, e.status || 502) }
}
