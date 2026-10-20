// Porteiro: nenhuma página ou dado sai sem sessão válida. Só a tela de login e a criação do primeiro administrador ficam abertas.
import { leSessao, json } from "../lib/auth.js";
// A Cloudflare serve "/login.html" também como "/login": comparamos sem o ".html".
const ABERTOS = new Set(["/login", "/setup", "/api/login", "/api/setup", "/favicon.ico", "/cliente.json", "/estilo.css"]);
const SEGURANCA = {
  "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000", "X-Robots-Tag": "noindex, nofollow"
};
function comCabecalhos(resp, privado) {
  const r = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(SEGURANCA)) r.headers.set(k, v);
  if (privado) r.headers.set("Cache-Control", "private, no-store");
  return r;
}
export async function onRequest(ctx) {
  const { request, env, next } = ctx;
  const url = new URL(request.url), path = url.pathname, limpo = path.replace(/\.html$/, "").replace(/\/index$/, "/");
  if (path === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain" } });
  if (ABERTOS.has(limpo) || path.startsWith("/marca/")) return comCabecalhos(await next(), false);
  const u = await leSessao(request, env);
  if (!u) {
    if (path.startsWith("/api/")) return json({ error: "Sessão expirada. Entre de novo." }, 401);
    const destino = /^\/[a-z0-9-]*(\.html)?$/i.test(path) ? path + url.search : "/";
    return Response.redirect(`${url.origin}/login.html?next=${encodeURIComponent(destino)}`, 302);
  }
  if ((limpo === "/admin" || limpo === "/configuracoes" || limpo === "/consumo" || path.startsWith("/historico/") || path.startsWith("/api/consumo") || path.startsWith("/api/usuarios") || path.startsWith("/api/config")) && u.papel !== "admin") {
    return path.startsWith("/api/") ? json({ error: "Só administradores." }, 403) : Response.redirect(url.origin + "/", 302);
  }
  ctx.data.usuario = u;
  return comCabecalhos(await next(), true);
}
