#!/usr/bin/env python3
"""
design-audit/compare.py — Figma 스크린샷과 빌드 렌더를 나란히(왼=Figma, 오=빌드) 겹쳐 비교 이미지 생성.

사용법:
  python3 tools/design-audit/compare.py <figma.png> <build.png> <out.png> [fig_top]
    figma.png  Figma get_screenshot 으로 받은 PNG (보통 폭 464 = 위젯400 + 좌우 쉐도우32)
    build.png  render.js 가 만든 out/L_<screen>.png
    out.png    저장할 비교 이미지 경로
    fig_top    (선택) Figma에서 본문 시작 y. 본문(#log)만 렌더했으면 헤더 높이만큼 잘라냄(기본 164).
               헤더까지 비교(--full)면 0 을 넣으세요.

필요: pip 패키지 Pillow (이 환경엔 설치돼 있음).
"""
import sys
from PIL import Image

if len(sys.argv) < 4:
    print(__doc__)
    sys.exit(1)

fig_p, build_p, out = sys.argv[1], sys.argv[2], sys.argv[3]
fig_top = int(sys.argv[4]) if len(sys.argv) > 4 else 164

f = Image.open(fig_p).convert('RGB')
# Figma 위젯폭=400, 좌우 쉐도우 32px → x[32:432] 크롭. (스케일된 경우 비율로 보정)
if f.size[0] >= 460:
    left = round(f.size[0] * 32 / 464)
    f = f.crop((left, fig_top, f.size[0] - left, f.size[1]))
elif fig_top:
    f = f.crop((0, fig_top, f.size[0], f.size[1]))
# 폭 400으로 정규화
f = f.resize((400, round(f.size[1] * 400 / f.size[0])))

b = Image.open(build_p).convert('RGB')
if b.size[0] != 400:
    b = b.resize((400, round(b.size[1] * 400 / b.size[0])))

H = max(f.size[1], b.size[1])
canvas = Image.new('RGB', (400 * 2 + 12, H), (150, 150, 150))
canvas.paste(f, (0, 0))
canvas.paste(b, (412, 0))
canvas.save(out)
print('saved', out, '| 왼=Figma', f.size, '오=빌드', b.size)
