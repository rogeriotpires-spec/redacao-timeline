// Acesso ao repositório do cliente no GitHub (token guardado na Cloudflare, nunca no navegador).
export const gh = (env, path, init = {}) => fetch(`${env.GH_API || "https://api.github.com"}/repos/${env.GH_REPO}${path}`, { ...init, headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "redacao-inteligente", "Content-Type": "application/json" } });
export const b64dec = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, "")), c => c.charCodeAt(0)));
export const b64enc = t => { const u = new TextEncoder().encode(t); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) };
export async function le(env, caminho) {
  const r = await gh(env, `/contents/${caminho}?ref=main`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`O GitHub respondeu ${r.status} ao ler ${caminho}.`);
  return r.json();
}
export async function leJson(env, caminho, padrao = null) { const f = await le(env, caminho); return f ? { dados: JSON.parse(b64dec(f.content)), sha: f.sha } : { dados: padrao, sha: null } }
// Um commit só com todos os arquivos, para as rotinas que reagem a ele rodarem uma vez.
export async function commit(env, arquivos, msg) {
  const ok = async (r, o) => { if (!r.ok) throw new Error(`O GitHub respondeu ${r.status} ao ${o}.`); return r.json() };
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const ref = await ok(await gh(env, "/git/ref/heads/main"), "ler o repositório");
    const base = await ok(await gh(env, `/git/commits/${ref.object.sha}`), "ler o último commit");
    const tree = [];
    for (const f of arquivos) {
      const blob = await ok(await gh(env, "/git/blobs", { method: "POST", body: JSON.stringify({ content: f.b64, encoding: "base64" }) }), "enviar " + f.path);
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const t = await ok(await gh(env, "/git/trees", { method: "POST", body: JSON.stringify({ base_tree: base.tree.sha, tree }) }), "montar o commit");
    const c = await ok(await gh(env, "/git/commits", { method: "POST", body: JSON.stringify({ message: msg, tree: t.sha, parents: [ref.object.sha] }) }), "criar o commit");
    const u = await gh(env, "/git/refs/heads/main", { method: "PATCH", body: JSON.stringify({ sha: c.sha, force: false }) });
    if (u.ok) return c.sha;
    if (u.status !== 422) throw new Error(`O GitHub respondeu ${u.status} ao gravar.`);
  }
  throw new Error("O repositório mudou durante a gravação. Tente de novo.");
}
