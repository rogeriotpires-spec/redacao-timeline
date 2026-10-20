"""Controle de geração e histórico de consumo.

  python3 tools/controle.py pode <evento> <rotina>
      Decide se a rotina pode rodar agora e qual modelo usar. Escreve pode=sim|nao, modelo=... e motivo=...
      em $GITHUB_OUTPUT (ou na tela). Regras, a partir de controle.json:
        estado "ativo":   agendadas e manuais rodam
        estado "manual":  só as disparadas pelo painel (agendadas ficam suspensas)
        estado "pausado": nada roda
        orçamento do mês atingido: nada roda (exceto excluir item, que não usa o Claude)

  python3 tools/controle.py registrar <rotina> <evento> <usuario> <inicio_iso> <resultado> [execution_file]
      Acrescenta a execução em historico/consumo.json com custo, tokens, duração e o que foi gerado.
"""
import json, os, sys, datetime as dt, glob

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
MODELOS = {"economico": "claude-haiku-4-5-20251001", "equilibrado": "claude-sonnet-5-5", "maximo": "claude-opus-5-5"}
PADRAO = {"estado": "manual", "orcamento_mensal_usd": 0,
          "modelos": {"noticias": "economico", "programa": "equilibrado", "avulso": "equilibrado"}}
HIST = "historico/consumo.json"
BR = dt.timezone(dt.timedelta(hours=-3))


def controle():
    c = dict(PADRAO)
    try: c.update(json.load(open("controle.json", encoding="utf-8")))
    except Exception: pass
    c["modelos"] = {**PADRAO["modelos"], **(c.get("modelos") or {})}
    return c


def historico():
    try: return json.load(open(HIST, encoding="utf-8"))
    except Exception: return {"execucoes": []}


def gasto_mes(h, agora=None):
    m = (agora or dt.datetime.now(BR)).strftime("%Y-%m")
    return sum(e.get("custo_usd") or 0 for e in h["execucoes"] if str(e.get("inicio", "")).startswith(m))


def saida(**kv):
    linhas = "".join(f"{k}={v}\n" for k, v in kv.items())
    if os.environ.get("GITHUB_OUTPUT"):
        open(os.environ["GITHUB_OUTPUT"], "a").write(linhas)
    print(linhas, end="")


def pode(evento, rotina):
    c = controle()
    modelo = MODELOS.get(c["modelos"].get(rotina, "equilibrado"), MODELOS["equilibrado"])
    if rotina == "excluir":
        return saida(pode="sim", modelo=modelo, motivo="ok")
    estado = c.get("estado", "manual")
    if estado == "pausado":
        return saida(pode="nao", modelo=modelo, motivo="geração pausada pelo administrador")
    if evento == "schedule" and estado != "ativo":
        return saida(pode="nao", modelo=modelo, motivo="gerações automáticas suspensas (só manual)")
    orc = float(c.get("orcamento_mensal_usd") or 0)
    if orc > 0 and gasto_mes(historico()) >= orc:
        return saida(pode="nao", modelo=modelo, motivo=f"orçamento do mês atingido (US$ {orc:.2f})")
    saida(pode="sim", modelo=modelo, motivo="ok")


def ler_execucao(arq):
    """O arquivo de execução do Claude é uma lista de mensagens; a última do tipo result traz custo e uso."""
    try: msgs = json.load(open(arq, encoding="utf-8"))
    except Exception: return {}
    if isinstance(msgs, dict): msgs = [msgs]
    res = next((m for m in reversed(msgs) if isinstance(m, dict) and m.get("type") == "result"), None) or {}
    u = res.get("usage") or {}
    modelos = list((res.get("modelUsage") or {}).keys())
    if not modelos:
        modelos = sorted({m.get("message", {}).get("model") for m in msgs if isinstance(m, dict) and m.get("type") == "assistant"} - {None})
    buscas = (u.get("server_tool_use") or {}).get("web_search_requests")
    return {"custo_usd": round(float(res["total_cost_usd"]), 4) if res.get("total_cost_usd") is not None else None,
            "duracao_claude_s": round((res.get("duration_ms") or 0) / 1000) or None,
            "turnos": res.get("num_turns"),
            "tokens": {"entrada": u.get("input_tokens"), "saida": u.get("output_tokens"),
                       "cache_gravado": u.get("cache_creation_input_tokens"), "cache_lido": u.get("cache_read_input_tokens")},
            "buscas_web": buscas, "modelos": modelos}


def artefato(rotina):
    try:
        if rotina == "noticias":
            e = sorted(json.load(open("noticias/index.json"))["editions"])[-1]
            return {"tipo": "Edição de notícias", "id": e, "link": f"/#{e}"}
        if rotina in ("programa", "avulso", "excluir"):
            p = {}
            if os.path.exists("pedido-avulso.json"): p = json.load(open("pedido-avulso.json"))
            if os.environ.get("PAYLOAD"):
                try: p = json.loads(os.environ["PAYLOAD"])
                except Exception: pass
            d = p.get("data") or sorted(json.load(open("programa/index.json"))["days"])[-1]
            nome = {"programa": "Pauta do programa", "avulso": "Item avulso na pauta", "excluir": "Item retirado da pauta"}[rotina]
            det = (p.get("pedido") or p.get("titulo") or "")[:160]
            return {"tipo": nome, "id": d, "link": f"/pauta.html#{d}", **({"detalhe": det} if det else {})}
    except Exception:
        pass
    return {"tipo": rotina, "id": None, "link": None}


def registrar(rotina, evento, usuario, inicio, resultado, arq=None):
    h = historico()
    agora = dt.datetime.now(BR)
    if not (usuario or "").strip() and os.environ.get("PAYLOAD"):
        try: usuario = json.loads(os.environ["PAYLOAD"]).get("usuario") or ""
        except Exception: pass
    try: ini = dt.datetime.fromisoformat(inicio.replace("Z", "+00:00")).astimezone(BR)
    except Exception: ini = agora
    e = {"id": os.environ.get("GITHUB_RUN_ID", agora.strftime("%Y%m%d%H%M%S")),
         "rotina": rotina, "origem": "planejada" if evento == "schedule" else "manual",
         "usuario": (usuario or "").strip() or None,
         "inicio": ini.isoformat(timespec="seconds"), "fim": agora.isoformat(timespec="seconds"),
         "duracao_s": int((agora - ini).total_seconds()),
         "resultado": {"success": "sucesso", "failure": "falha", "cancelled": "cancelada", "skipped": "não rodou"}.get(resultado, resultado),
         "artefato": artefato(rotina), "modelo_escolhido": os.environ.get("MODELO") or None,
         "custo_usd": 0.0 if rotina == "excluir" else None}
    if arq and os.path.exists(arq): e.update(ler_execucao(arq))
    if os.environ.get("GITHUB_REPOSITORY") and os.environ.get("GITHUB_RUN_ID"):
        e["execucao_url"] = f"https://github.com/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
    h["execucoes"] = [x for x in h["execucoes"] if x.get("id") != e["id"]] + [e]
    h["execucoes"] = h["execucoes"][-2000:]
    h["atualizado"] = agora.isoformat(timespec="seconds")
    os.makedirs("historico", exist_ok=True)
    json.dump(h, open(HIST, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    custo = e.get("custo_usd")
    print(f"registrado: {rotina} {e['origem']} {e['resultado']} custo={'?' if custo is None else f'US$ {custo:.4f}'} duração={e['duracao_s']}s")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["pode"]: pode(a[1], a[2])
    elif a[:1] == ["registrar"]: registrar(*a[1:7])
    else: sys.exit(__doc__)
