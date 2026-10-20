// Validação da configuração que o administrador do cliente envia pela tela de Configurações.
// Tudo é reduzido a texto curto, números em faixa e listas limitadas: nada de campo livre vira código.
const s = (x, max = 120) => String(x ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const lista = (x, n, max) => (Array.isArray(x) ? x : String(x ?? "").split(/\n|;/)).map(v => s(v, max)).filter(Boolean).slice(0, n);
const int = (x, a, b, d) => { const v = parseInt(x, 10); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d };
const hora = (x, d) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(x || "")) ? String(x) : d;
const cor = (x, d) => /^#[0-9a-f]{6}$/i.test(String(x || "")) ? String(x).toLowerCase() : d;
const url = x => { try { const u = new URL(String(x || "").trim()); return /^https?:$/.test(u.protocol) ? u.origin + (u.pathname === "/" ? "" : u.pathname) : null } catch (e) { return null } };

export function validaConfig(novo, atual, plano = null) {
  const n = novo || {}, a = atual || {}, P = n.programa || {}, AP = a.programa || {}, R = n.regiao || {}, AR = a.regiao || {}, M = n.marca || {}, AM = a.marca || {};
  const erros = [];
  const veiculo = s(n.veiculo, 80) || a.veiculo; if (!veiculo) erros.push("Informe o nome do veículo.");
  const dias = [...new Set((Array.isArray(P.dias) ? P.dias : []).map(d => int(d, 0, 6, -1)).filter(d => d >= 0))].sort();
  if (!dias.length) erros.push("Marque pelo menos um dia do programa.");
  const edicoes = [...new Set((Array.isArray(n.noticias?.edicoes) ? n.noticias.edicoes : []).map(e => int(String(e).replace(/\D/g, ""), 0, 23, -1)).filter(h => h >= 0))].sort((x, y) => x - y).slice(0, 6);
  if (!edicoes.length) erros.push("Escolha pelo menos um horário de edição das notícias.");
  if (plano && edicoes.length > plano.edicoes_dia) erros.push(`O plano ${plano.nome} inclui até ${plano.edicoes_dia} edições de notícias por dia.`);
  if (plano && !plano.regional && n.cobertura !== "nacional") erros.push(`A cobertura regional faz parte dos planos acima do ${plano.nome}. Escolha cobertura nacional ou fale sobre o upgrade.`);
  const portais = (Array.isArray(R.portais) ? R.portais : []).slice(0, 20).map(p => ({ name: s(p.name, 60), url: url(p.url), camp: "regional", tier: int(p.tier, 2, 3, 2) })).filter(p => p.name && p.url);
  const C = {
    _doc: a._doc || "Configuração do cliente. Editada pela tela de Configurações do painel.",
    produto: a.produto || "Redação Inteligente",
    cliente: s(n.cliente, 80) || veiculo,
    veiculo,
    cobertura: n.cobertura === "nacional" ? "nacional" : "regional",
    programa: {
      nome: s(P.nome, 80) || AP.nome || "Programa",
      apresentadores: lista(P.apresentadores, 8, 60),
      dias,
      horario: hora(P.horario, AP.horario || "07:00"),
      gera_pauta_as: hora(P.gera_pauta_as, AP.gera_pauta_as || "05:30"),
      virada_hora: int(P.virada_hora, 0, 23, AP.virada_hora ?? 14),
      itens: int(P.itens, 3, 15, AP.itens || 6),
      linhas_resumo: int(P.linhas_resumo, 3, 10, AP.linhas_resumo || 5),
      perguntas_por_item: int(P.perguntas_por_item, 1, 6, AP.perguntas_por_item || 3),
      metafora_percentual: int(P.metafora_percentual, 0, 100, AP.metafora_percentual ?? 25),
      blocos: lista(P.blocos, 14, 40)
    },
    linha_editorial: s(n.linha_editorial, 1500),
    temas_prioritarios: lista(n.temas_prioritarios, 15, 60),
    fontes_da_linha: lista(n.fontes_da_linha, 15, 60),
    voz: lista(n.voz, 12, 300),
    regiao: { nome: s(R.nome, 60) || AR.nome || "Região", rotulo_bloco: s(R.rotulo_bloco, 40) || s(R.nome, 40) || AR.rotulo_bloco || "Região", buscas: lista(R.buscas, 8, 200), portais },
    esportes_buscas: lista(n.esportes_buscas, 5, 200),
    noticias: { edicoes: edicoes.map(h => String(h).padStart(2, "0") + "h") },
    marca: {
      logo: AM.logo || null,
      cor: cor(M.cores?.primaria || M.cor, AM.cor || "#0b3d91"),
      cores: {
        primaria: cor(M.cores?.primaria || M.cor, AM.cores?.primaria || AM.cor || "#0b3d91"),
        escura: cor(M.cores?.escura, AM.cores?.escura || "#0d1b2e"),
        acento: cor(M.cores?.acento, AM.cores?.acento || "#a63922"),
        destaque: cor(M.cores?.destaque, AM.cores?.destaque || "#ffd23f"),
        sobre_destaque: cor(M.cores?.sobre_destaque, AM.cores?.sobre_destaque || "#0d1b2e")
      }
    }
  };
  if (!C.programa.blocos.length) erros.push("Informe os blocos do programa.");
  if (C.cobertura === "regional" && !s(R.nome, 60)) erros.push("Informe a região de cobertura, ou escolha cobertura nacional.");
  if (C.cobertura === "nacional") C.programa.blocos = C.programa.blocos.filter(b => b !== "Região");
  if (!C.linha_editorial) erros.push("Descreva a linha editorial.");
  return { config: C, erros };
}

// Logo: só PNG (o navegador já converte e reduz). SVG fica de fora por segurança.
export function validaLogo(dataUrl) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) return { erro: "O logo precisa chegar como PNG." };
  const b64 = m[1], bytes = Math.floor(b64.length * 3 / 4);
  if (bytes > 900_000) return { erro: "O logo ficou grande demais. Use uma imagem menor." };
  const sig = atob(b64.slice(0, 12));
  if (!sig.startsWith("\x89PNG")) return { erro: "Arquivo de logo inválido." };
  return { b64 };
}
