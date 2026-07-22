# -*- coding: utf-8 -*-
"""도표 7종 — 대시보드 카드판 (레퍼런스: Tate 리포트 / Stripe형 대시보드 / 미터 카드 / 파이낸스 카드).
문법: 화이트 카드(제목+설명 헤더, 각주 푸터) 안에 차트.
트랙+필 바, 도넛 중앙 수치, 노치 미터, 틴트 필. 라이트 팔레트 검증 완료(ALL PASS).
카드 외폭 700(우측 칼럼) / 1128(전폭), 내부 SVG 648 / 1076.
"""

INK   = "#12141c"
INK2  = "#3f4450"
INK3  = "#6b7280"
FAINT = "#9aa1ad"
HAIR  = "#e6e8ee"
FILL  = "#f1f2f6"
TRACK = "#edeff4"
ACC   = "#1f4fd6"
ACC2  = "#4a71e8"
ACC_SOFT = "#e9eefc"
GOOD  = "#0f7a45"
GOOD_SOFT = "#e6f2ec"
ALERT = "#cd3f14"
ALERT_SOFT = "#fdeee7"
NEUT  = "#c9cdd6"        # 컨테이너·장식 전용 (데이터 마크 금지)
DGRAY = "#868e9c"        # 데이터 등급 그레이 (vs white 3.30, WCAG 3:1 충족)
DREST = "#8d95a3"        # 도넛 잔여 세그먼트 (3.02)
TXT3  = "#565d6a"        # 연회색 배경 위 보조 텍스트 (f1f2f6 위 5.92)
F = 'font-family="Pretendard Variable,Pretendard,-apple-system,BlinkMacSystemFont,sans-serif"'

def T(x, y, s, size=15, fill=INK2, w=500, anchor="start", ls=None):
    a = f' text-anchor="{anchor}"' if anchor != "start" else ""
    l = f' letter-spacing="{ls}"' if ls else ""
    return f'<text x="{x:.0f}" y="{y:.0f}" font-size="{size}" font-weight="{w}" fill="{fill}"{a}{l} {F}>{s}</text>'

def kw(s, size=14):
    import unicodedata
    return sum(size * (0.99 if unicodedata.east_asian_width(c) in "WF" else 0.58) for c in s)

def NUM(x, y, val, unit="", size=44, fill=INK, unit_fill=INK3, anchor="start"):
    out = [T(x, y, val, size, fill, 800, anchor=anchor)]
    if unit:
        import unicodedata
        vw = sum(size * (0.58 if unicodedata.east_asian_width(c) not in "WF" else 1.0) for c in str(val))
        ux = x + vw + size * 0.10 if anchor == "start" else x + size * 0.12
        out.append(T(ux, y - size * 0.52, unit, size * 0.32, unit_fill, 700))
    return "".join(out)

DEFS = f'''<defs>
<linearGradient id="gmeter" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#b9cbf5"/><stop offset="1" stop-color="{ACC}"/>
</linearGradient>
<filter id="fly" x="-40%" y="-40%" width="180%" height="220%">
  <feDropShadow dx="0" dy="3" stdDeviation="7" flood-color="#12141c" flood-opacity="0.16"/>
</filter>
</defs>'''

# 공통 카드 래퍼 (덱과 컨플루언스 PNG가 같은 스펙 공유)
CARD_CSS = """
.card{background:#ffffff;border:1px solid #e7e9ef;border-radius:16px;
  box-shadow:0 1px 3px rgba(18,20,28,.05);padding:24px 26px 22px}
.card .ch{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px}
.card .ct{font-size:15.5px;font-weight:750;color:#12141c;letter-spacing:-.012em}
.card .cd{font-size:12.5px;color:#6b7280;margin-top:5px;line-height:1.55}
.card .tag{flex:none;font-size:11.5px;font-weight:800;color:#3a5cc4;background:#e9eefc;
  border-radius:12px;padding:4px 11px;letter-spacing:.02em;white-space:nowrap}
.card .cf{font-size:12px;color:#6b7280;margin-top:16px;line-height:1.6}
.card .cf b{color:#3f4450;font-weight:700}
.card svg{display:block;width:100%;height:auto}
.mini{background:#ffffff;border:1px solid #e7e9ef;border-radius:16px;
  box-shadow:0 1px 3px rgba(18,20,28,.05);padding:22px 24px;display:flex;flex-direction:column}
.mini .ml{font-size:12px;font-weight:800;letter-spacing:.14em;color:#6b7280}
.mini .mv{font-size:66px;font-weight:800;letter-spacing:-.035em;line-height:1.02;color:#12141c;margin-top:14px}
.mini .mv em{font-style:normal;font-size:17px;font-weight:700;color:#6b7280;margin-left:5px;vertical-align:30px}
.mini .mv.warm{color:#cd3f14}
.mini .md{font-size:12.5px;color:#6b7280;line-height:1.6;margin-top:auto;padding-top:14px}
"""

CARD_META = {
    "exposure":   ("상단 동시 노출, 확인한 14곳", "상단 공지 정책을 명시했거나 실측으로 확인한 서비스",
                   "<b>도표 1</b> 1건 고정은 컨플루언스, 카카오, 텔레그램, 인터콤, 머티리얼, GOV.UK, 쇼피파이. 배지와 목록은 비머, 헤드웨이, 캐니, 캔버스. 위젯 공지가 없는 곳은 젠데스크, 프레시챗, 채널톡입니다", "14곳 실측"),
    "clicks":     ("회전 배너 클릭 분포", "미국 노터데임대학교 웹팀이 자기 대학 사이트에서 실측한 값",
                   "<b>도표 3</b> 클릭한 방문자 1퍼센트 안에서의 분포입니다", "노터데임대 실측"),
    "retention":  ("내리는 시점, 0일에서 60일까지", "열람은 즉시, 미열람은 14일, 어떤 경우에도 30일을 넘기지 않습니다",
                   "<b>도표 2</b> 수정하면 열람 상태를 되돌려 다시 노출합니다", "업계 11곳 대조"),
    "severity":   ("심각도와 놓이는 자리", "유형마다 자리와 규칙이 다릅니다",
                   "<b>도표 4</b> 우리 Notification 컴포넌트의 Status 변형과 그대로 맞물립니다", "Status 3종"),
    "gate":       ("게시 게이트, 세 물음", "릴리스 기획자가 쓰고 운영 UX가 거릅니다",
                   "<b>도표 5</b> 세 물음을 모두 통과해야 바에 오릅니다", "운영 UX 게이트"),
    "structure":  ("노출 구조", "회의의 3안과 10안은 상충이 아니라 서로 다른 자리에 놓일 값입니다",
                   "<b>도표</b> 기각한 대안은 상단 3건 동시 노출입니다. 구글 머티리얼 디자인이 금지 예시로 명시한 패턴입니다", "확정 구조"),
    "dependency": ("개발 의존 관계", "열람 상태 저장 한 건이 네 가지를 받칩니다",
                   "<b>도표 6</b> 이 건이 배정되면 나머지는 뒤이어 진행할 수 있습니다", "개발 1순위"),
}

def card(key, width=None):
    t, d, f, tag = CARD_META[key]
    w = width or WIDTHS[key]
    svg = CHARTS[key]()
    return (f'<div class="card" style="width:{w}px">'
            f'<div class="ch"><div><div class="ct">{t}</div><div class="cd">{d}</div></div>'
            f'<div class="tag">{tag}</div></div>'
            f'{svg}<div class="cf">{f}</div></div>')


# ================================================================ 1. 동시 노출 — 트랙+필 바 (내부 648)
def chart_exposure_units():
    """Tate 트랙 컬럼 + Stripe형 플라이아웃 툴팁. 라운드탑 필, 값 상단 라벨."""
    W, H = 648, 300
    cols = [
        ("상단에 1건 고정", 7, ACC),
        ("배지와 목록만", 4, ACC2),
        ("위젯 공지 없음", 3, DGRAY),
        ("2건 이상 쌓음", 0, GOOD),
    ]
    mx = 7
    cw, gap = 112, 42
    x0 = (W - (len(cols) * cw + (len(cols) - 1) * gap)) / 2
    t_top, t_h = 74, 154
    base = t_top + t_h
    def topround(x, y, w, h, r=10):
        return (f'<path d="M {x:.0f} {y+h:.0f} v {-(h-r):.0f} q 0 {-r} {r} {-r} '
                f'h {w-2*r:.0f} q {r} 0 {r} {r} v {h-r:.0f} z"')
    s = [f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="서비스 14곳의 상단 동시 노출 정책 분포. 1건 고정 7곳, 배지와 목록 4곳, 위젯 공지 없음 3곳, 2건 이상 0곳">', DEFS]
    fly = None
    for i, (label, n, color) in enumerate(cols):
        x = x0 + i * (cw + gap)
        cx = x + cw / 2
        s.append(f'<rect x="{x:.0f}" y="{t_top}" width="{cw}" height="{t_h}" rx="10" fill="{TRACK}"/>')
        if n > 0:
            fh = t_h * n / mx
            fy = base - fh
            s.append(topround(x, fy, cw, fh) + f' fill="{color}"/>')
        if i == 0:
            # 플라이아웃 툴팁 (첫 컬럼, 핵심 값)
            fw, fh2 = 196, 58
            fx, fyy = cx - fw / 2, t_top - 66
            fly = (f'<g filter="url(#fly)"><rect x="{fx:.0f}" y="{fyy}" width="{fw}" height="{fh2}" rx="12" fill="#ffffff"/>'
                   f'<path d="M {cx-8:.0f} {fyy+fh2} h 16 l -8 9 z" fill="#ffffff"/></g>'
                   f'<rect x="{fx+18:.0f}" y="{fyy+23}" width="11" height="11" rx="3.5" fill="{ACC}"/>'
                   + T(fx + 40, fyy + 24, "상단에 1건 고정", 13, INK3, 600)
                   + T(fx + 40, fyy + 45, "14곳 중 7곳", 15.5, INK, 800))
        else:
            vy = (base - t_h * n / mx if n else base) - 12
            s.append(T(cx - 4, vy, str(n), 27, color, 800, anchor="middle"))
            s.append(T(cx + 14, vy, "곳", 12.5, INK3, 700))
        if i == 0:
            pw = kw(label, 12.5) + 30
            s.append(f'<rect x="{cx - pw/2:.0f}" y="{base+11}" width="{pw:.0f}" height="26" rx="13" fill="#101b3c"/>')
            s.append(T(cx, base + 28, label, 12.5, "#ffffff", 700, anchor="middle"))
        else:
            s.append(T(cx, base + 28, label, 13, INK, 650, anchor="middle"))
    s.append(f'<line x1="{x0:.0f}" y1="{base}" x2="{x0 + len(cols)*cw + (len(cols)-1)*gap:.0f}" y2="{base}" stroke="{HAIR}" stroke-width="1.5"/>')
    if fly:
        s.append(fly)
    s.append("</svg>")
    return "".join(s)


# ================================================================ 2. 클릭 분포 — 도넛 중앙 수치 (내부 648)
def chart_click_distribution():
    import math
    W, H = 648, 312
    cx, cy, r, sw = 152, 156, 110, 38
    C = 2 * math.pi * r
    a_len = C * 0.84
    s = [f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="회전 배너 클릭 분포. 첫 칸 84퍼센트, 나머지 네 칸의 합 16퍼센트">', DEFS]
    s.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#e4e7ed" stroke-width="{sw}"/>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{ALERT}" stroke-width="{sw}" '
             f'stroke-dasharray="{a_len:.1f} {C - a_len:.1f}" stroke-dashoffset="{C * 0.25:.1f}" stroke-linecap="round"/>')
    s.append(T(cx, cy + 6, "84%", 58, INK, 800, anchor="middle"))
    s.append(T(cx, cy + 36, "첫 번째 칸", 13.5, INK3, 600, anchor="middle"))
    lx = 356
    legend = [("첫 번째 칸", "84%", ALERT, INK), ("두 번째부터 다섯 번째 칸의 합", "16%", "#d6dae2", INK3)]
    for i, (lab, v, dot, vf) in enumerate(legend):
        ly = 116 + i * 58
        s.append(f'<rect x="{lx}" y="{ly}" width="12" height="12" rx="4" fill="{dot}"/>')
        s.append(T(lx + 24, ly + 11, lab, 14, INK2, 600))
        s.append(T(W, ly + 12, v, 17, vf, 800, anchor="end"))
        if i == 0:
            s.append(f'<line x1="{lx}" y1="{ly+34}" x2="{W}" y2="{ly+34}" stroke="{HAIR}" stroke-width="1"/>')
    s.append("</svg>")
    return "".join(s)


# ================================================================ 3. 기간 — 노치 미터 (내부 648)
def chart_retention_line():
    W, H = 648, 252
    x0, x1 = 4, 644
    my, mh = 118, 48
    def dx(d): return x0 + (x1 - x0) * d / 60
    def notch(d, color, label, sub):
        x = dx(d)
        return (f'<rect x="{x-7:.0f}" y="{my-6}" width="14" height="{mh+12}" rx="7" fill="#ffffff"/>'
                f'<rect x="{x-2.5:.0f}" y="{my-6}" width="5" height="{mh+12}" rx="2.5" fill="{color}"/>'
                + T(x, my - 40, label, 14.5, INK, 750, anchor="middle")
                + T(x, my - 20, sub, 12, INK3, 500, anchor="middle"))
    s = [f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="유지 기간 규칙. 열람 즉시, 미열람 14일, 절대 상한 30일">', DEFS]
    # 밴드: 플랫 3단 (라벨 대비 우선, 12.5px 텍스트 전부 4.5:1 이상)
    s.append(f'<rect x="{dx(0):.0f}" y="{my}" width="{dx(14)-dx(0):.0f}" height="{mh}" rx="9" fill="url(#gmeter)"/>')
    s.append(f'<rect x="{dx(14)-9:.0f}" y="{my}" width="{dx(30)-dx(14)+9:.0f}" height="{mh}" fill="#dde1ea"/>')
    s.append(f'<rect x="{dx(30)-9:.0f}" y="{my}" width="{dx(60)-dx(30)+9:.0f}" height="{mh}" rx="9" fill="#f2f3f7"/>')
    s.append(T(dx(14) - 18, my + 25, "미열람 유지", 12.5, "#ffffff", 700, anchor="end"))
    s.append(T((dx(14)+dx(30))/2, my + 25, "정리 유예", 12.5, INK2, 700, anchor="middle"))
    s.append(T((dx(30)+dx(60))/2, my + 25, "남지 않음", 12.5, TXT3, 600, anchor="middle"))
    # 시작점: 열람 즉시
    s.append(f'<circle cx="{dx(0)+1:.0f}" cy="{my-24}" r="4.5" fill="{GOOD}"/>')
    s.append(T(dx(0) + 12, my - 20, "열람 즉시 내림", 13, GOOD, 700))
    # 노치 2개
    s.append(notch(14, ACC, "14일", "미열람 정리"))
    s.append(notch(30, ALERT, "30일", "절대 상한"))
    # 축
    for d in (0, 14, 30, 60):
        anc = "start" if d == 0 else ("end" if d == 60 else "middle")
        s.append(T(dx(d), my + mh + 26, f"{d}일", 12.5, INK3, 600, anchor=anc))
    # 업계 마커
    for d, label, anc in ((28, "유튜브 4주", "end"), (60, "스포티파이 60일", "end")):
        s.append(f'<circle cx="{dx(d):.0f}" cy="{my+mh+52}" r="4" fill="none" stroke="{DGRAY}" stroke-width="2"/>')
        s.append(T(dx(d) - 10, my + mh + 57, label, 12, INK3, 600, anchor=anc))
    s.append("</svg>")
    return "".join(s)


# ================================================================ 4. 심각도 매핑 (내부 648)
def chart_severity_map():
    """전폭 1076. 3행 매핑, 대형 타이포."""
    W, H = 1076, 276
    rows = [
        ("기능 소식", "info 바", "닫을 수 있고 소진되면 목록에 남습니다", ACC, ACC_SOFT),
        ("서비스 장애", "error 바", "바를 혼자 차지하고 닫기가 없습니다", ALERT, ALERT_SOFT),
        ("대화 실패", "대화 안 인라인", "말풍선 자리에서 바로 다시 시도합니다", TXT3, FILL),
    ]
    s = [f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="심각도별 노출 자리 매핑 표">', DEFS]
    s.append(T(0, 16, "유형", 12, INK3, 700, ls=".08em"))
    s.append(T(340, 16, "놓이는 자리", 12, INK3, 700, ls=".08em"))
    s.append(T(660, 16, "규칙", 12, INK3, 700, ls=".08em"))
    s.append(f'<line x1="0" y1="30" x2="{W}" y2="30" stroke="{HAIR}" stroke-width="1.5"/>')
    for i, (sev, place, desc, color, soft) in enumerate(rows):
        y = 30 + i * 82
        mid = y + 48
        s.append(T(0, mid + 6, sev, 22, INK, 750))
        pw = kw(place, 15) + 40
        s.append(f'<rect x="340" y="{y+22}" width="{pw:.0f}" height="42" rx="21" fill="{soft}"/>')
        s.append(T(340 + pw / 2, mid + 4, place, 15, color, 800, anchor="middle"))
        s.append(T(660, mid + 4, desc, 15, INK2, 500))
        if i < 2:
            s.append(f'<line x1="0" y1="{y+82}" x2="{W}" y2="{y+82}" stroke="{HAIR}" stroke-width="1"/>')
    s.append("</svg>")
    return "".join(s)


# ================================================================ 5. 게시 게이트 (내부 648)
def chart_gate_flow():
    """전폭 1076. 세 물음 3열 + 분기 결과 2행."""
    W, H = 1076, 300
    qs = ["운영자의 일하는 방식이\n바뀌는가", "화면이나 절차, 기능이\n사라지는가", "하루 한 건 상한을\n넘지 않는가"]
    s = [f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="게시 게이트. 세 물음을 모두 통과해야 바에 오릅니다">', DEFS]
    qw, qh, qgap = 344, 108, 22
    for i, q in enumerate(qs):
        x = i * (qw + qgap)
        s.append(f'<rect x="{x}" y="0" width="{qw}" height="{qh}" rx="14" fill="{FILL}"/>')
        s.append(f'<circle cx="{x+34}" cy="34" r="14" fill="{ACC}"/>')
        s.append(T(x + 34, 39.5, str(i + 1), 14, "#ffffff", 800, anchor="middle"))
        lines = q.split("\n")
        s.append(T(x + 24, 74, lines[0], 16.5, INK, 700))
        s.append(T(x + 24, 96, lines[1], 16.5, INK, 700))
    midx = W / 2
    s.append(f'<line x1="{midx}" y1="{qh+6}" x2="{midx}" y2="{qh+30}" stroke="{DGRAY}" stroke-width="2"/>')
    s.append(f'<path d="M {midx} {qh+34} l -5.5 -8 h 11 z" fill="{DGRAY}"/>')
    def outcome(y, pill, pill_fg, pill_bg, text, text_fill, border):
        pw = kw(pill, 12.5) + 28
        return (f'<rect x="0" y="{y}" width="{W}" height="52" rx="13" fill="#ffffff" stroke="{border}" stroke-width="1.5"/>'
                f'<rect x="20" y="{y+13}" width="{pw:.0f}" height="26" rx="13" fill="{pill_bg}"/>'
                + T(20 + pw / 2, y + 31, pill, 12.5, pill_fg, 800, anchor="middle")
                + T(20 + pw + 20, y + 33, text, 16, text_fill, 700))
    s.append(outcome(qh + 44, "셋 다 통과", GOOD, GOOD_SOFT, "알림 바에 게시하고 소진되면 목록으로", INK, "#bcd8c9"))
    s.append(outcome(qh + 108, "하나라도 걸림", TXT3, FILL, "바에 올리지 않고 전체 보기 목록에만", INK2, HAIR))
    s.append("</svg>")
    return "".join(s)


# ================================================================ 6. 노출 구조 (내부 1076)
def chart_structure():
    W, H = 1076, 264
    s = [f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="노출 구조. 바에 1건, 뒤에 2건, 목록에 10건">', DEFS]
    s.append(T(0, 20, "알림 바", 12.5, INK3, 700, ls=".08em"))
    bx, by, bw, bh = 0, 36, 496, 76
    s.append(f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="14" fill="{ACC_SOFT}"/>')
    s.append(f'<rect x="{bx}" y="{by}" width="{bw}" height="5" rx="2.5" fill="{ACC}"/>')
    s.append(f'<circle cx="{bx+38}" cy="{by+40}" r="13" fill="{ACC}"/>')
    s.append(T(bx + 38, by + 45, "i", 14, "#ffffff", 800, anchor="middle"))
    s.append(T(bx + 66, by + 36, "지금 보이는 공지", 17, INK, 700))
    s.append(T(bx + 66, by + 59, "제목과 한 줄 보조 문구", 13, INK3, 500))
    s.append(NUM(bx + bw - 72, by + 52, "1", "건", 34, ACC))
    for i in range(2):
        qw = bw - 32 - i * 26
        s.append(f'<rect x="{bx+16+i*13}" y="{by+bh+12+i*12}" width="{qw}" height="10" rx="5" fill="#d9deea"/>')
    s.append(T(bx + 16, by + bh + 62, "뒤에서 차례를 기다리는 공지", 13.5, INK3, 500))
    s.append(NUM(bx + bw - 118, by + bh + 62, "2", "건까지", 27, INK2))
    cy = by + bh / 2
    s.append(f'<line x1="{bx+bw+20}" y1="{cy}" x2="{bx+bw+64}" y2="{cy}" stroke="{DGRAY}" stroke-width="2"/>')
    s.append(f'<path d="M {bx+bw+64} {cy} l -7 -4.5 v 9 z" fill="{DGRAY}"/>')
    s.append(T(bx + bw + 42, cy - 13, "소진되면", 12, INK3, 500, anchor="middle"))
    lx = bx + bw + 80
    lw = W - lx
    ly, lh = 36, 214
    s.append(T(lx, 20, "전체 보기 목록", 12.5, INK3, 700, ls=".08em"))
    s.append(f'<rect x="{lx}" y="{ly}" width="{lw}" height="{lh}" rx="14" fill="#fbfbfd" stroke="{HAIR}"/>')
    s.append(f'<rect x="{lx}" y="{ly}" width="{lw}" height="5" rx="2.5" fill="{NEUT}"/>')
    for i in range(4):
        ry = ly + 28 + i * 38
        s.append(f'<rect x="{lx+24}" y="{ry}" width="{lw-212}" height="11" rx="5.5" fill="{TRACK}"/>')
        s.append(f'<rect x="{lx+lw-162}" y="{ry}" width="54" height="11" rx="5.5" fill="#f4f5f8"/>')
        if i < 2:
            s.append(f'<rect x="{lx+lw-88}" y="{ry-6}" width="52" height="21" rx="10.5" fill="{ACC}"/>')
            s.append(T(lx + lw - 62, ry + 9, "NEW", 11, "#ffffff", 800, anchor="middle"))
    s.append(NUM(lx + lw - 162, ly + lh - 20, "10", "건까지", 32, INK))
    s.append("</svg>")
    return "".join(s)


# ================================================================ 7. 개발 의존 (내부 648)
def chart_dependency():
    W, H = 648, 316
    deps = ["미열람 14일 자동 해제", "내용 수정 시 재노출", "오류 우선 노출 순서", "두 번째 공지 도달률 측정"]
    s = [f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="개발 의존 관계. 열람 상태 저장이 네 가지의 전제">', DEFS]
    rx0, ry0, rw, rh = 0, 104, 216, 100
    s.append(f'<rect x="{rx0}" y="{ry0}" width="{rw}" height="{rh}" rx="14" fill="{ACC}"/>')
    s.append(T(rx0 + 24, ry0 + 42, "열람 상태 저장", 18.5, "#ffffff", 800))
    s.append(T(rx0 + 24, ry0 + 68, "계정 기준, 개발 1순위", 12.5, "#c9d7fb", 700))
    gx = 274
    tx, tw, th = 344, 304, 54
    root_cy = ry0 + rh / 2
    s.append(f'<line x1="{rx0+rw}" y1="{root_cy}" x2="{gx}" y2="{root_cy}" stroke="{DGRAY}" stroke-width="2"/>')
    cys = []
    for i, d in enumerate(deps):
        ty = 6 + i * 72
        cy2 = ty + th / 2
        cys.append(cy2)
        s.append(f'<rect x="{tx}" y="{ty}" width="{tw}" height="{th}" rx="12" fill="{FILL}"/>')
        s.append(T(tx + 22, cy2 + 5, d, 14.5, INK2, 600))
        s.append(f'<line x1="{gx}" y1="{cy2}" x2="{tx}" y2="{cy2}" stroke="{DGRAY}" stroke-width="2"/>')
        s.append(f'<path d="M {tx} {cy2} l -7 -4.5 v 9 z" fill="{DGRAY}"/>')
    s.append(f'<line x1="{gx}" y1="{min(cys)}" x2="{gx}" y2="{max(cys)}" stroke="{DGRAY}" stroke-width="2"/>')
    s.append("</svg>")
    return "".join(s)


# ================================================================ KPI 카드용 스파크라인 (240×80)
# 파이낸스 카드 레퍼런스: 스탯 카드 = 라벨 + 큰 수치 + 미니 차트. 카드 가운데 여백을 채운다.
def _pal(dark):
    if dark:
        return dict(ink="#ffffff", sub="#9db4f5", track="rgba(255,255,255,.16)",
                    acc="#6f93ff", acc2="#4a71e8", warm="#ff8256", good="#7fd6a8", faint="rgba(255,255,255,.34)")
    return dict(ink=INK, sub=INK3, track=TRACK, acc=ACC, acc2=ACC2, warm=ALERT, good=GOOD, faint=DGRAY)

def spark_exposure(dark=False):
    p = _pal(dark); W, H = 240, 80
    s = [f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">']
    # 1 filled slot
    s.append(f'<rect x="0" y="26" width="30" height="30" rx="8" fill="{p["acc"]}"/>')
    # 2 queue slots (outline)
    for i in range(2):
        s.append(f'<rect x="{38+i*20}" y="26" width="30" height="30" rx="8" fill="none" stroke="{p["acc2"]}" stroke-width="2"/>')
    s.append(f'<line x1="102" y1="20" x2="102" y2="62" stroke="{p["faint"]}" stroke-width="1.5"/>')
    # 10 list dots (2x5)
    for r in range(2):
        for c in range(5):
            s.append(f'<circle cx="{122+c*22}" cy="{34+r*18}" r="4.5" fill="{p["track"]}"/>')
    s.append(f'<text x="0" y="16" font-size="10.5" font-weight="800" fill="{p["sub"]}" letter-spacing=".06em" {F}>바 1 · 대기 2 · 목록 10</text>')
    s.append("</svg>"); return "".join(s)

def spark_retention(dark=False):
    p = _pal(dark); W, H = 240, 80
    def dx(d): return 6 + (228) * d / 60
    s = [f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">']
    s.append(f'<rect x="{dx(0):.0f}" y="40" width="{dx(60)-dx(0):.0f}" height="8" rx="4" fill="{p["track"]}"/>')
    s.append(f'<rect x="{dx(0):.0f}" y="40" width="{dx(14)-dx(0):.0f}" height="8" rx="4" fill="{p["acc"]}"/>')
    for d, col, lab in ((14, p["acc"], "14"), (30, p["warm"], "30")):
        s.append(f'<line x1="{dx(d):.0f}" y1="32" x2="{dx(d):.0f}" y2="56" stroke="{col}" stroke-width="3"/>')
        s.append(f'<text x="{dx(d):.0f}" y="26" font-size="12" font-weight="800" fill="{p["ink"]}" text-anchor="middle" {F}>{lab}</text>')
    for d in (0, 60):
        s.append(f'<text x="{dx(d):.0f}" y="72" font-size="10" font-weight="600" fill="{p["sub"]}" text-anchor="{"start" if d==0 else "end"}" {F}>{d}일</text>')
    s.append("</svg>"); return "".join(s)

def spark_clicks(dark=False):
    p = _pal(dark); W, H = 240, 80
    base, top = 62, 24
    for_bars = [(56, 84, p["warm"]), (150, 16, p["track"])]
    s = [f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">']
    for bx, v, col in for_bars:
        bh = (base - top) * v / 84; by = base - bh
        s.append(f'<rect x="{bx}" y="{by:.0f}" width="52" height="{bh:.0f}" rx="5" fill="{col}"/>')
        s.append(f'<text x="{bx+26}" y="{by-5:.0f}" font-size="13" font-weight="800" fill="{p["ink"] if v>50 else p["sub"]}" text-anchor="middle" {F}>{v}%</text>')
    s.append(f'<line x1="6" y1="{base}" x2="234" y2="{base}" stroke="{p["faint"]}" stroke-width="1.5"/>')
    s.append(f'<text x="82" y="74" font-size="10" font-weight="600" fill="{p["sub"]}" text-anchor="middle" {F}>첫 칸</text>')
    s.append(f'<text x="176" y="74" font-size="10" font-weight="600" fill="{p["sub"]}" text-anchor="middle" {F}>나머지 합</text>')
    s.append("</svg>"); return "".join(s)

def spark_verify(dark=False):
    p = _pal(dark); W, H = 240, 80
    def dx(d): return 10 + 190 * d / 60
    s = [f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">']
    s.append(f'<line x1="{dx(0):.0f}" y1="34" x2="{dx(60):.0f}" y2="34" stroke="{p["track"]}" stroke-width="8" stroke-linecap="round"/>')
    s.append(f'<circle cx="{dx(0):.0f}" cy="34" r="6" fill="{p["sub"]}"/>')
    s.append(f'<text x="{dx(0):.0f}" y="60" font-size="10" font-weight="600" fill="{p["sub"]}" text-anchor="middle" {F}>배포</text>')
    s.append(f'<circle cx="{dx(60):.0f}" cy="34" r="9" fill="{p["acc"]}" stroke="{"#101b3c" if dark else "#fff"}" stroke-width="3"/>')
    s.append(f'<text x="{dx(60):.0f}" y="60" font-size="11" font-weight="800" fill="{p["ink"]}" text-anchor="middle" {F}>D+60</text>')
    # 판정 라벨
    s.append(f'<text x="228" y="30" font-size="10.5" font-weight="700" fill="{p["sub"]}" text-anchor="end" {F}>도달률 판정</text>')
    s.append("</svg>"); return "".join(s)

SPARKS = {"exposure": spark_exposure, "retention": spark_retention, "clicks": spark_clicks, "verify": spark_verify}


CHARTS = {
    "exposure": chart_exposure_units,
    "clicks": chart_click_distribution,
    "retention": chart_retention_line,
    "severity": chart_severity_map,
    "gate": chart_gate_flow,
    "structure": chart_structure,
    "dependency": chart_dependency,
}
WIDTHS = {"exposure": 700, "clicks": 700, "retention": 700, "severity": 1128, "gate": 1128, "structure": 1128, "dependency": 700}
