# 컨플루언스 업로드용 도표 카드 PNG 원본 html — 화이트 배경, 카드 스펙 공유, Pretendard 임베드
import os, sys
BASE = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE)
sys.path.insert(0, BASE)
import importlib, charts
importlib.reload(charts)
os.makedirs("charts_png", exist_ok=True)
FONT_B64 = open("font_b64.txt").read()
for key in charts.CHARTS:
    w = charts.WIDTHS[key]
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:'Pretendard Variable';font-weight:45 920;font-style:normal;
src:url(data:font/woff2;base64,{FONT_B64}) format('woff2-variations')}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:#ffffff;font-family:'Pretendard Variable',Pretendard,-apple-system,sans-serif;
word-break:keep-all;letter-spacing:-.012em;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}}
{charts.CARD_CSS}
#wrap{{display:inline-block;padding:14px;background:#ffffff}}
</style></head><body><div id="wrap">{charts.card(key)}</div></body></html>"""
    with open(f"charts_png/{key}.html", "w") as f:
        f.write(html)
    print(key, w)
