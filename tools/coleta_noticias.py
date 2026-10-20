"""Coleta as manchetes recentes dos portais de noticias/config.json pelo feed do Google Notícias (uma busca por site).
Portais marcados com "fetch": false (G1) ficam de fora, como sempre. Roda no GitHub antes da edição.
Uso: python3 tools/coleta_noticias.py [horas] > coleta-noticias.json"""
import json, os, sys, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone, timedelta
os.chdir(os.path.join(os.path.dirname(__file__), ".."))
horas = int(sys.argv[1]) if len(sys.argv) > 1 else 12
cfg = json.load(open("noticias/config.json", encoding="utf-8"))
BRT = timezone(timedelta(hours=-3)); agora = datetime.now(BRT); corte = agora - timedelta(hours=horas)
def dominio(u):
    h = urllib.parse.urlparse(u).netloc.replace("www.", ""); p = urllib.parse.urlparse(u).path.strip("/")
    return h + ("/" + p.split("/")[0] if p and h in ("bbc.com", "dw.com", "msn.com", "otempo.com.br") else "")
saida = {"coletado": agora.replace(microsecond=0).isoformat(), "horas": horas, "portais": []}
for o in cfg["outlets"]:
    if o.get("fetch") is False: continue
    d = dominio(o["url"]); q = f"site:{d} when:{max(1, round(horas/24)) if horas >= 24 else str(horas) + 'h'}"
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q, "hl": "pt-BR", "gl": "BR", "ceid": "BR:pt-419"})
    itens, erro = [], None
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (redacao)"})
        root = ET.fromstring(urllib.request.urlopen(req, timeout=20).read())
        for it in root.iter("item"):
            t = (it.findtext("title") or "").strip(); fonte = (it.findtext("source") or "").strip()
            if fonte and t.endswith(" - " + fonte): t = t[: -len(" - " + fonte)]
            try: dt = parsedate_to_datetime(it.findtext("pubDate")).astimezone(BRT)
            except Exception: dt = None
            if dt and dt < corte: continue
            itens.append({"titulo": t, "quando": dt.strftime("%d/%m %H:%M") if dt else "", "link": it.findtext("link")})
            if len(itens) >= 25: break
    except Exception as e:
        erro = str(e)[:120]
    saida["portais"].append({"nome": o["name"], "camp": o.get("camp"), "tier": o.get("tier"), "dominio": d, "manchetes": itens, **({"erro": erro} if erro else {})})
    time.sleep(0.6)
# buscas por tema (todos os veículos brasileiros), para os blocos que costumam ficar vazios
CL = json.load(open("cliente.json", encoding="utf-8"))
TEMAS = {
    "educacao": ["MEC OR Enem OR Fies OR Prouni OR Inep", "universidade federal OR instituto federal OR reitoria", "escola pública OR professores OR rede estadual de ensino"],
    **({"regiao": CL["regiao"]["buscas"]} if CL.get("cobertura", "regional") == "regional" and CL.get("regiao", {}).get("buscas") else {}),
    "ciencia": ["inteligência artificial", "ciência OR pesquisa científica OR CNPq OR Capes OR Finep", "startup OR inovação OR tecnologia big tech", "saúde OR vacina OR medicina estudo"],
    "esportes": CL.get("esportes_buscas") or ["seleção brasileira OR CBF OR Brasileirão"]}
saida["temas"] = {}
for tema, qs in TEMAS.items():
    vistos, lista = set(), []
    for q in qs:
        url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q + f" when:{horas}h", "hl": "pt-BR", "gl": "BR", "ceid": "BR:pt-419"})
        try:
            root = ET.fromstring(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (redacao)"}), timeout=20).read())
            for it in root.iter("item"):
                t = (it.findtext("title") or "").strip(); fonte = (it.findtext("source") or "").strip()
                if fonte and t.endswith(" - " + fonte): t = t[: -len(" - " + fonte)]
                if t.lower() in vistos: continue
                vistos.add(t.lower())
                try: dt = parsedate_to_datetime(it.findtext("pubDate")).astimezone(BRT)
                except Exception: dt = None
                lista.append({"titulo": t, "fonte": fonte, "quando": dt.strftime("%d/%m %H:%M") if dt else "", "link": it.findtext("link")})
                if len(lista) >= 60: break
        except Exception: pass
        time.sleep(0.6)
    saida["temas"][tema] = lista
tot = sum(len(p["manchetes"]) for p in saida["portais"]); com = sum(1 for p in saida["portais"] if p["manchetes"])
saida["resumo"] = f"{tot} manchetes de {com} de {len(saida['portais'])} portais nas últimas {horas} horas; temas: " + ", ".join(f"{k} {len(v)}" for k, v in saida["temas"].items())
print(json.dumps(saida, ensure_ascii=False, indent=1))
print(saida["resumo"], file=sys.stderr)
