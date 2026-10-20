import { json, publico } from "../../lib/auth.js";
export async function onRequestGet({ data }) {
  const p = data.plano;
  return json({ ...publico(data.usuario), operador: data.operador, troca_senha: !!data.usuario.troca_senha,
    plano: { id: p.id, nome: p.nome, edicoes_dia: p.edicoes_dia, regional: p.regional } });
}
