"""Leitura direta do feed RSS de um portal com o Scrapling.

Usado por tools/coleta_noticias.py para os portais que têm "feed" em noticias/config.json.
Se o Scrapling não estiver instalado ou o feed falhar, devolve None e a coleta
volta para o Google Notícias, como era antes.
"""
import html
import xml.etree.ElementTree as ET
from datetime import timedelta
from email.utils import parsedate_to_datetime
from datetime import datetime

try:
    from scrapling.fetchers import Fetcher
except Exception:  # sem Scrapling: a coleta segue só pelo Google Notícias
    Fetcher = None


def _data(texto, BRT, agora):
    if not texto:
        return None
    texto = texto.strip()
    try:
        d = parsedate_to_datetime(texto)
    except Exception:
        try:
            d = datetime.fromisoformat(texto.replace("Z", "+00:00"))
        except Exception:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=BRT)
    d = d.astimezone(BRT)
    # feeds que marcam a hora de Brasília como se fosse GMT
    if d > agora + timedelta(minutes=10):
        d -= timedelta(hours=3)
    return d


def _bytes(resp):
    corpo = getattr(resp, "body", None)
    if isinstance(corpo, (bytes, bytearray)) and corpo:
        return bytes(corpo)
    if isinstance(corpo, str) and corpo:
        return corpo.encode("utf-8")
    return str(getattr(resp, "html_content", resp)).encode("utf-8")


def _tag(el):
    return el.tag.split("}")[-1].split(":")[-1] if isinstance(el.tag, str) else ""


def ler(url, corte, BRT, agora, limite=25):
    """Lista de manchetes no formato da coleta, ou None se não deu para ler."""
    if Fetcher is None:
        return None
    try:
        resp = Fetcher.get(url, timeout=20)
        if resp.status != 200:
            return None
        dados = _bytes(resp)
        try:
            raiz = ET.fromstring(dados)
        except ET.ParseError:
            from lxml import etree
            raiz = etree.fromstring(dados, etree.XMLParser(recover=True))
        itens = []
        for it in raiz.iter():
            if _tag(it) not in ("item", "entry"):
                continue
            campos = {}
            for f in it:
                t = _tag(f)
                if t == "link" and f.get("href"):
                    campos["link"] = f.get("href")
                elif f.text:
                    campos.setdefault(t, f.text.strip())
            titulo = html.unescape(campos.get("title", "")).replace("<![CDATA[", "").replace("]]>", "").strip()
            dt = _data(campos.get("pubDate") or campos.get("published") or campos.get("updated") or campos.get("date"), BRT, agora)
            if not titulo or not dt or dt < corte:
                continue
            itens.append({"titulo": titulo, "quando": dt.strftime("%d/%m %H:%M"), "link": campos.get("link", "")})
            if len(itens) >= limite:
                break
        return itens or None
    except Exception:
        return None
