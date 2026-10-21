// Situação da última execução de uma rotina (para a página acompanhar o andamento).
import { json } from "../../lib/auth.js";
const OK = new Set(["noticias.yml", "programa.yml", "programa-avulso.yml", "pauta-excluir.yml", "pauta-ordem.yml", "configurar.yml", "publicar.yml"]);
export async function onRequestGet({ request, env }) {
  const wf = new URL(request.url).searchParams.get("wf");
  if (!OK.has(wf)) return json({ error: "Rotina desconhecida." }, 400);
  const r = await fetch(`${env.GH_API || "https://api.github.com"}/repos/${env.GH_REPO}/actions/workflows/${wf}/runs?per_page=1`, { headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "redacao-inteligente" } });
  if (!r.ok) return json({ error: `GitHub ${r.status}` }, 502);
  const run = ((await r.json()).workflow_runs || [])[0];
  return json(run ? { status: run.status, conclusion: run.conclusion, created_at: run.created_at } : {});
}
