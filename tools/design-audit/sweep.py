#!/usr/bin/env python3
"""
design-audit/sweep.py — "전 화면 자동 점검" (one-command Figma↔build 전수 대조)

오늘 손으로 하던 절차(화면마다 빌드 렌더 → 피그마 캡처 → 나란히 비교)를 한 줄로 묶는다.
실행하면: ① screens.json의 모든 렌더 가능 화면을 자동 렌더 → ② 캐시된 Figma 캡처(out/fig_<key>.png)와
나란히(왼=Figma·오=빌드) → ③ 전부 한 장(out/SWEEP.png)으로. 피그마 캡처가 없는 화면은 목록으로 알려준다.

사용법:
  python3 tools/design-audit/sweep.py [--parent] [--no-render] [--cols N]
    --parent     학부모 페이지로 렌더(L_<key>_parent_full.png)
    --no-render  빌드 재렌더 생략(기존 out/L_*_full.png 사용 — 빠름)
    --cols N      한 줄에 화면 N개(기본 2)

Figma 캡처 갱신(out/fig_<key>.png): 지금은 Claude가 Figma MCP get_screenshot으로 받아 캐시.
  추후 Figma API 토큰을 연동하면 이 스크립트가 직접 받아오도록 확장(= 완전 자동).

필요: python3 + Pillow(설치돼 있음), node + Playwright(render.cjs용).
"""
import os, sys, json, subprocess
from PIL import Image, ImageDraw, ImageFont

DIR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(DIR, 'out')
cfg = json.load(open(os.path.join(DIR, 'screens.json'), encoding='utf-8'))

PARENT   = '--parent' in sys.argv
NORENDER = '--no-render' in sys.argv
COLS = 2
if '--cols' in sys.argv:
    COLS = int(sys.argv[sys.argv.index('--cols') + 1])

W = cfg.get('phoneWidth', 400)
suffix = '_parent' if PARENT else ''

def renderable(key, s):
    # figma 노드가 있고, 내비 경로가 있거나 home(빈 경로지만 렌더 가능)인 화면.
    # *_empty(평소 미발생)·메뉴(figma null)는 제외.
    return s.get('figma') and (len(s.get('nav', [])) > 0 or key == 'home')

screens = [(k, s) for k, s in cfg['screens'].items()
           if isinstance(s, dict) and renderable(k, s)]

def font(sz):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()

def fig_tile(key):
    """캐시된 Figma 캡처를 400폭으로(좌우 32px 쉐도우 크롭)."""
    fp = os.path.join(OUT, f'fig_{key}.png')
    if not os.path.exists(fp) or os.path.getsize(fp) == 0:
        return None
    f = Image.open(fp).convert('RGB')
    if f.size[0] >= 460:  # 위젯400 + 쉐도우32*2
        l = round(f.size[0] * 32 / 464)
        f = f.crop((l, 0, f.size[0] - l, f.size[1]))
    return f.resize((W, round(f.size[1] * W / f.size[0])))

def build_tile(key):
    bp = os.path.join(OUT, f'L_{key}{suffix}_full.png')
    if not os.path.exists(bp):
        return None
    b = Image.open(bp).convert('RGB')
    if b.size[0] != W:
        b = b.resize((W, round(b.size[1] * W / b.size[0])))
    return b

def render_build(key):
    env = dict(os.environ)
    try:
        env['NODE_PATH'] = subprocess.check_output(['npm', 'root', '-g']).decode().strip()
    except Exception:
        pass
    args = ['node', os.path.join(DIR, 'render.cjs'), key, '--full']
    if PARENT:
        args.append('--parent')
    r = subprocess.run(args, cwd=os.path.join(DIR, '..', '..'),
                       env=env, capture_output=True, text=True)
    return r.returncode == 0

LBL_H = 30
GAP = 12
PAD = 8
f_lbl = font(16)

tiles, missing_fig, render_fail = [], [], []
for key, s in screens:
    if not NORENDER:
        if not render_build(key):
            render_fail.append(key)
    b = build_tile(key)
    fg = fig_tile(key)
    if fg is None:
        missing_fig.append(f"{key} ({s['figma']})")
    th = max(fg.size[1] if fg else 0, b.size[1] if b else 0)
    tile = Image.new('RGB', (W * 2 + GAP, th + LBL_H), (245, 245, 245))
    d = ImageDraw.Draw(tile)
    d.rectangle([0, 0, tile.size[0], LBL_H], fill=(33, 33, 33))
    d.text((PAD, 7), f"{key}  [{s['figma']}]   ←Figma | build→", font=f_lbl, fill=(255, 255, 255))
    if fg:
        tile.paste(fg, (0, LBL_H))
    else:
        d.rectangle([0, LBL_H, W, LBL_H + th], fill=(225, 225, 225))
        d.text((PAD, LBL_H + 10), "(Figma 캡처 없음)", font=f_lbl, fill=(120, 120, 120))
    if b:
        tile.paste(b, (W + GAP, LBL_H))
    tiles.append(tile)

# 그리드 배치
ROWS = (len(tiles) + COLS - 1) // COLS
col_w = W * 2 + GAP
row_heights = []
for r in range(ROWS):
    row = tiles[r * COLS:(r + 1) * COLS]
    row_heights.append(max(t.size[1] for t in row))
SEP = 16
canvas_w = COLS * col_w + (COLS + 1) * SEP
canvas_h = sum(row_heights) + (ROWS + 1) * SEP
canvas = Image.new('RGB', (canvas_w, canvas_h), (90, 90, 90))
y = SEP
for r in range(ROWS):
    x = SEP
    for c in range(COLS):
        i = r * COLS + c
        if i < len(tiles):
            canvas.paste(tiles[i], (x, y))
        x += col_w + SEP
    y += row_heights[r] + SEP

out_name = f"SWEEP{suffix}.png"
canvas.save(os.path.join(OUT, out_name))
print(f"✓ {out_name} 저장 — {len(tiles)}개 화면 (왼=Figma, 오=빌드)  크기 {canvas.size}")
if render_fail:
    print(f"⚠ 렌더 실패: {', '.join(render_fail)}")
if missing_fig:
    print(f"⚠ Figma 캡처 없음(갱신 필요): {', '.join(missing_fig)}")
else:
    print("✓ 모든 화면 Figma 캡처 보유")
