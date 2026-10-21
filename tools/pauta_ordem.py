"""Reordena os itens da pauta do programa (botões de subir e descer da página da pauta).
Uso: PAYLOAD='{"data":"AAAA-MM-DD","ordem":["título do 1º item", "título do 2º", ...]}' python3 tools/pauta_ordem.py
Itens citados vêm primeiro, na ordem pedida; itens que não estão na lista (ex.: um avulso que chegou depois)
continuam na pauta, na posição relativa que já tinham."""
import json, os, re, sys
from datetime import datetime, timezone, timedelta
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
p = json.loads(os.environ["PAYLOAD"])
data, ordem = str(p.get("data", "")), [str(t).strip() for t in (p.get("ordem") or []) if str(t).strip()]
if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", data): sys.exit("data inválida")
if not ordem: sys.exit("ordem vazia")
f = f"programa/{data}.json"
if not os.path.exists(f): sys.exit(f"pauta não existe: {f}")
d = json.load(open(f, encoding="utf-8"))
itens = d.get("itens", [])
pos = {t: i for i, t in enumerate(ordem)}
antes = [x.get("titulo", "").strip() for x in itens]
# estável: citados pela posição pedida; os demais ficam logo após o citado que os precedia
chave, ult = [], -1
for i, x in enumerate(itens):
    t = x.get("titulo", "").strip()
    if t in pos: ult = pos[t]; chave.append((pos[t], 0, i))
    else: chave.append((ult, 1, i))
novo = [itens[i] for _, _, i in sorted(chave)]
if [x.get("titulo", "").strip() for x in novo] == antes: print("ordem já estava assim"); sys.exit(0)
d["itens"] = novo
d["ordem_manual"] = True
d["atualizado"] = datetime.now(timezone(timedelta(hours=-3))).replace(microsecond=0).isoformat()
json.dump(d, open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("nova ordem:", " | ".join(x.get("titulo", "")[:40] for x in novo))
