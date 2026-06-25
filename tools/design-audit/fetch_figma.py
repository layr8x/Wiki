#!/usr/bin/env python3
"""
design-audit/fetch_figma.py — screens.json의 모든 Figma 노드 캡처를 REST API로 자동 다운로드 → out/fig_<key>.png

sweep.py 앞에 이걸 돌리면 Figma 쪽 캡처가 자동 갱신돼 '완전 무인' 대조가 된다(Claude 개입 0):
    export FIGMA_TOKEN=figd_xxx
    python3 tools/design-audit/fetch_figma.py && python3 tools/design-audit/sweep.py

★ 보안: 토큰은 코드에 박지 않고 **환경변수 FIGMA_TOKEN**에서만 읽는다.
  - 영구 보관은 저장소(git)가 아니라 환경설정/시크릿(Vercel 환경변수, Claude Code 환경 등)에.
  - 토큰은 비밀번호와 같다. 노출되면 Figma에서 재발급(Regenerate)할 것.

사용법:
  python3 tools/design-audit/fetch_figma.py [--only key1,key2] [--scale N]
"""
import os, sys, json, urllib.request, urllib.parse

DIR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(DIR, 'out'); os.makedirs(OUT, exist_ok=True)
cfg = json.load(open(os.path.join(DIR, 'screens.json'), encoding='utf-8'))

TOKEN = os.environ.get('FIGMA_TOKEN', '').strip()
if not TOKEN:
    sys.exit("FIGMA_TOKEN 환경변수가 없습니다.  export FIGMA_TOKEN=figd_xxx  후 다시 실행하세요.")

FILE = cfg['fileKey']
scale = '2'
if '--scale' in sys.argv:
    scale = sys.argv[sys.argv.index('--scale') + 1]
only = None
if '--only' in sys.argv:
    only = set(sys.argv[sys.argv.index('--only') + 1].split(','))

nodes = {k: s['figma'] for k, s in cfg['screens'].items()
         if isinstance(s, dict) and s.get('figma') and (only is None or k in only)}
if not nodes:
    sys.exit("받을 노드가 없습니다.")

# Figma는 한 번에 여러 노드 이미지 URL을 돌려준다(ids 콤마 구분).
ids = ','.join(nodes.values())
# Figma는 ids의 콜론·콤마를 인코딩하지 않은 형태로 받는다(인코딩 시 400).
url = f"https://api.figma.com/v1/images/{FILE}?ids={urllib.parse.quote(ids, safe=':,')}&format=png&scale={scale}"
req = urllib.request.Request(url, headers={'X-Figma-Token': TOKEN})
try:
    data = json.load(urllib.request.urlopen(req, timeout=90))
except Exception as e:
    sys.exit(f"Figma API 호출 실패: {e}")
if data.get('err'):
    sys.exit(f"Figma API 에러: {data['err']}  (토큰 계정이 이 파일에 접근 가능한지 확인)")

images = data.get('images', {})
ok, fail = 0, []
for k, nid in nodes.items():
    iu = images.get(nid)
    if not iu:
        fail.append(f"{k}({nid}: 렌더 URL 없음 — 노드가 삭제됐을 수 있음)")
        continue
    try:
        with urllib.request.urlopen(iu, timeout=90) as r, open(os.path.join(OUT, f'fig_{k}.png'), 'wb') as f:
            f.write(r.read())
        ok += 1
    except Exception as e:
        fail.append(f"{k}({e})")

print(f"✓ Figma 캡처 {ok}개 자동 다운로드 → out/fig_<key>.png  (REST API, scale {scale})")
if fail:
    print("⚠ 실패: " + ', '.join(fail))
