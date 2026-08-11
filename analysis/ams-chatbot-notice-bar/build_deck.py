# -*- coding: utf-8 -*-
"""AMS 챗봇 알림 바 — 대시보드 카드 문법 슬라이드 덱 (1280x720, 16장).
레퍼런스: Tate 애뉴얼 리포트 / Stripe형 오버뷰 / 노치 미터 카드 / 파이낸스 카드 그리드.
문법: 그레이 캔버스 + 화이트 카드(제목·설명·각주 앵커), 트랙+필, 도넛 중앙 수치,
틴트 필, 좌 선언 / 우 증거 카드. 블루 풀블리드는 커버·요청 2장.
"""
import base64, os, importlib
import charts
importlib.reload(charts)

BASE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(BASE, "shots")
EXTRA = SHOTS  # 이관 번들 정본 위치: screen_after.png도 shots/에 있음

def b64(path):
    with open(path, "rb") as f:
        data = base64.b64encode(f.read()).decode()
    ext = os.path.splitext(path)[1].lstrip(".").lower()
    mime = "jpeg" if ext in ("jpg", "jpeg") else ext
    return f"data:image/{mime};base64,{data}"

def img(name, folder=SHOTS):
    return b64(os.path.join(folder, name))

CARD = {k: charts.card(k) for k in charts.CHARTS}
# KPI 스파크: 노출 카드는 다크 히어로(dark=True), 나머지는 라이트
SPARK = {
    "exposure": charts.SPARKS["exposure"](True),
    "retention": charts.SPARKS["retention"](False),
    "clicks": charts.SPARKS["clicks"](False),
    "verify": charts.SPARKS["verify"](False),
}

IC_CHK = '<svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.4"/><path d="M5.2 8.3 7.1 10.2 10.8 6.1"/></svg>'
IC_UP  = '<svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12 12 4M6.8 4H12v5.2"/></svg>'
IC_CLK = '<svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.4"/><path d="M8 4.6V8l2.4 1.5"/></svg>'
IC_CAL = '<svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.6" y="3.4" width="10.8" height="10" rx="2"/><path d="M2.6 6.6h10.8M5.4 1.8v3.2M10.6 1.8v3.2"/></svg>'

FONT_B64 = open(os.path.join(BASE, "font_b64.txt")).read()

CSS = f"""
  @font-face{{
    font-family:'Pretendard Variable';
    font-weight:45 920;
    font-style:normal;
    font-display:block;
    src:url(data:font/woff2;base64,{FONT_B64}) format('woff2-variations');
  }}
  :root{{
    --ink:#12141c; --ink2:#3f4450; --ink3:#6b7280; --faint:#9aa1ad;
    --hair:#e6e8ee; --fill:#f1f2f6; --canvas:#eef0f4; --card:#ffffff;
    --cardline:#e7e9ef;
    --acc:#1f4fd6; --acc2:#4a71e8; --acc-soft:#e9eefc;
    --good:#0f7a45; --alert:#cd3f14; --navy:#101b3c;
  }}
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{background:#dfe2e8;font-family:'Pretendard Variable',Pretendard,-apple-system,BlinkMacSystemFont,sans-serif;
    -webkit-font-smoothing:antialiased;word-break:keep-all;line-break:strict;letter-spacing:-.012em;
    font-variant-numeric:tabular-nums;
    display:flex;flex-direction:column;align-items:center;gap:28px;padding:28px 0}}
  .slide{{position:relative;width:1280px;height:720px;background:var(--canvas);color:var(--ink);
    overflow:hidden;border-radius:6px;flex:none;box-shadow:0 2px 14px rgba(18,20,28,.08)}}
  .slide > *{{position:relative;z-index:1}}
  .pad{{padding:48px 60px}}

  /* 공통 요소 */
  .kick{{font-size:13px;font-weight:700;color:var(--acc);letter-spacing:.24em;margin-bottom:24px}}
  .folio{{position:absolute;left:76px;bottom:34px;font-size:12px;color:#7d8592;letter-spacing:.06em;z-index:1}}
  .pno{{position:absolute;right:76px;bottom:34px;font-size:12px;color:#7d8592;z-index:1}}
  h1{{font-size:72px;line-height:1.18;font-weight:750;letter-spacing:-.03em;color:var(--ink)}}
  h1 .hl{{color:var(--acc)}}
  h2{{font-size:42px;line-height:1.25;font-weight:750;letter-spacing:-.026em;max-width:560px}}
  h2 .hl{{color:var(--acc)}} h2 .off{{color:var(--alert)}}
  .lead{{font-size:18px;line-height:1.8;color:var(--ink2);margin-top:24px;max-width:660px}}
  .body{{font-size:15.5px;line-height:1.78;color:var(--ink2);margin-top:20px;max-width:520px}}
  .body b{{color:var(--ink);font-weight:700}}
  .meta{{font-size:13.5px;color:#5f6673;display:flex;gap:22px;margin-top:30px}}
  .meta b{{color:var(--ink);font-weight:700}}
  .cap{{font-size:12.5px;color:var(--ink3);line-height:1.6}}

  /* 카드 (도표 공용 스펙) */
  {charts.CARD_CSS}

  .sub{{font-size:14.5px;line-height:1.65;color:var(--ink2);margin-top:16px;max-width:900px}}
  .sub b{{color:var(--ink);font-weight:700}}
  .chiprow{{display:flex;gap:14px;margin-top:20px}}
  .dchip{{flex:1;display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--cardline);
    border-radius:14px;box-shadow:0 1px 3px rgba(18,20,28,.05);padding:16px 20px;font-size:14px;font-weight:700;color:var(--ink)}}
  .dchip .dn{{flex:none;width:26px;height:26px;border-radius:50%;background:var(--acc);color:#fff;
    display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800}}

  /* 증거 슬라이드: 상단 밴드 + 멀티 카드 행 */
  .ev .pad{{padding:44px 60px}}
  .tband{{display:grid;grid-template-columns:1fr 460px;gap:56px;align-items:end;margin-bottom:22px}}
  .tband .kick{{margin-bottom:12px}}
  .tband h2{{font-size:36px;max-width:560px}}
  .tband .tbody{{font-size:14px;line-height:1.72;color:var(--ink2);margin:0 0 4px}}
  .tband .tbody b{{color:var(--ink);font-weight:700}}
  .crow{{display:grid;grid-template-columns:700px 1fr;gap:24px;align-items:stretch}}
  .crow .stack{{display:grid;grid-template-rows:1fr 1fr;gap:24px}}
  .crow .card{{display:flex;flex-direction:column}}
  .crow .card svg{{margin-top:auto}}

  /* KPI 델타 행 */
  .kpi .delta{{display:flex;align-items:center;gap:7px;margin-top:16px;font-size:13px;font-weight:700}}
  .delta.good{{color:var(--good)}} .delta.acc{{color:var(--acc)}}
  .delta.alert{{color:var(--alert)}} .delta.neut{{color:#565d6a}}
  .delta svg{{width:15px;height:15px;flex:none}}

  /* 좌 선언 / 우 증거 카드 */
  .split{{display:grid;grid-template-columns:380px 1fr;gap:48px;height:100%;align-items:center}}
  .split .card{{justify-self:end}}

  /* KPI 카드 행 (Stripe형) */
  .kpi{{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;height:calc(100% - 70px);align-items:center}}
  .kpi .card{{display:flex;flex-direction:column;padding:26px 26px 22px;height:392px}}
  .kpi .lab{{font-size:12px;font-weight:800;letter-spacing:.18em;color:var(--ink3)}}
  .kpi .ctx{{font-size:12.5px;color:var(--ink3);margin-top:14px}}
  .kpi .v{{font-size:70px;font-weight:800;letter-spacing:-.035em;line-height:1.02;color:var(--ink);margin-top:10px}}
  .kpi .v em{{font-style:normal;font-size:18px;font-weight:700;color:var(--acc);margin-left:5px;vertical-align:26px}}
  .kpi .v.txt{{font-size:42px;line-height:1.15;margin-top:16px}}
  .kpi .spark{{margin-top:auto;padding-top:16px}}
  .kpi .spark svg{{display:block;width:100%;height:auto;max-height:80px}}
  .kpi .delta{{margin-top:16px;padding-top:14px;border-top:1px solid var(--hair)}}
  .hero .delta{{border-top-color:rgba(255,255,255,.14)}}
  .kpi .card.hero{{background:var(--navy);border-color:var(--navy)}}
  .hero .lab{{color:#8fa3d9}} .hero .ctx{{color:#93a5d6}}
  .hero .v{{color:#ffffff}} .hero .v em{{color:#9db4f5}}
  .hero .delta.good{{color:#7fd6a8}} .hero .r{{color:#a9b6d9}}

  /* 넘버드 리스트 — 카드 행 */
  .numlist{{margin-top:38px;display:flex;flex-direction:column;gap:16px}}
  .numlist .row{{display:grid;grid-template-columns:76px 1fr;align-items:baseline;
    background:var(--card);border:1px solid var(--cardline);border-radius:16px;
    box-shadow:0 1px 3px rgba(18,20,28,.05);padding:26px 32px}}
  .numlist .n{{font-size:18px;font-weight:800;color:var(--acc)}}
  .numlist .t{{font-size:27px;font-weight:750;letter-spacing:-.02em}}
  .numlist .d{{grid-column:2;font-size:14.5px;color:var(--ink3);margin-top:8px;line-height:1.7;max-width:820px}}

  /* 표 */
  table{{width:100%;border-collapse:collapse}}
  thead th{{font-size:12.5px;font-weight:800;color:var(--ink3);text-align:left;padding:12px 16px;border-bottom:1.5px solid #d6dae2;letter-spacing:.04em}}
  tbody td{{font-size:13.5px;color:var(--ink2);padding:8px 16px;border-top:1px solid var(--hair);line-height:1.5;vertical-align:top}}
  tbody tr:first-child td{{border-top:0}}
  tbody td:first-child{{font-weight:700;color:var(--ink);white-space:nowrap}}
  .tdd{{font-size:12px;color:var(--ink3);font-weight:500;margin-left:9px;letter-spacing:0}}
  td .one{{font-weight:800;color:var(--acc)}}
  td .keep{{font-weight:700;color:var(--good)}}
  td .none{{color:var(--faint)}}
  tr.ours td{{background:var(--acc-soft);border-top:1px solid #c6d4f5}}
  tr.ours td:first-child{{color:#173ba6;border-radius:8px 0 0 8px}}
  tr.ours td:last-child{{border-radius:0 8px 8px 0}}

  /* 풀블리드 블루 (Zonely) */
  .blue{{background:
      radial-gradient(120% 160% at 82% -22%, rgba(255,255,255,.16) 0%, transparent 55%),
      linear-gradient(155deg,#2b50f5 0%,#1a35c4 100%);color:#fff}}
  .blue h1,.blue h2{{color:#fff}}
  .blue h1 .hl,.blue h2 .hl{{color:#bcd0ff}}
  .blue .kick{{color:#dbe4ff}}
  .blue .body,.blue .lead{{color:#dde6ff}}
  .blue .meta{{color:#d9e2ff}} .blue .meta b{{color:#fff}}
  .blue .folio,.blue .pno{{color:#aabcf7}}

  /* 이미지 패널 */
  .imgpanel{{border:1px solid var(--cardline);border-radius:16px;overflow:hidden;background:#fff;
    box-shadow:0 1px 3px rgba(18,20,28,.05)}}
  .imgpanel img{{width:100%;height:100%;object-fit:cover;object-position:center top;display:block}}

  /* 스펙 2열 */
  .spec2{{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:34px}}
  .spec2 .col{{background:#fff;border:1px solid var(--cardline);border-radius:16px;padding:24px 30px;
    overflow:hidden;position:relative;box-shadow:0 1px 3px rgba(18,20,28,.05)}}
  .spec2 .col .tb{{position:absolute;top:0;left:0;right:0;height:5px}}
  .spec2 .sh{{font-size:13px;font-weight:800;letter-spacing:.1em;margin-bottom:6px}}
  .spec2 .ss{{font-size:12.5px;color:var(--ink3);margin-bottom:12px}}
  .spec2 .row{{display:grid;grid-template-columns:104px 1fr;gap:14px;padding:10px 0;border-top:1px solid var(--hair);font-size:13.5px;line-height:1.55}}
  .spec2 .row:first-of-type{{border-top:0}}
  .spec2 dt{{font-weight:800;color:var(--ink3);font-size:12.5px}}
  .spec2 dd{{color:var(--ink2)}}
  .spec2 dd b{{color:var(--ink);font-weight:700}}
  .pri{{display:inline-block;font-size:11px;font-weight:800;border-radius:9px;padding:2px 8px;margin-left:6px;vertical-align:1px}}
  .pri.p1{{background:var(--acc);color:#fff}}
  .pri.sz{{background:var(--fill);color:#565d6a}}

  /* 각주 */
  .refs{{columns:2;column-gap:52px;font-size:12px;color:var(--ink3);line-height:1.8}}
  .refs div{{break-inside:avoid;margin-bottom:8px}}
  .refs b{{color:var(--ink2)}}
  .refs .rn{{color:var(--acc);font-weight:800;margin-right:8px}}

  @media print{{
    body{{background:#fff;padding:0;gap:0;display:block}}
    .slide{{border-radius:0;box-shadow:none;page-break-after:always;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  }}
"""

S = []

# ---------------------------------------------------------------- 1. 커버
S.append(f'''
<section class="slide blue">
  <div class="pad" style="height:100%;display:flex;flex-direction:column;justify-content:center">
    <div class="kick">AMS 챗봇 베타 상단 알림 바</div>
    <h1>세 가지 물음을<br><span class="hl">사례로 매듭짓고,</span><br>결론을 <span class="hl">화면까지</span> 옮겼습니다</h1>
    <div class="meta" style="margin-top:44px">
      <span><b>김명준 · UX/UI Design · 플랫폼서비스실</b></span>
      <span>2026년 7월 20일</span>
      <span>검토 서른 곳 남짓, 실화면 캡처 32장</span>
    </div>
  </div>
</section>''')

# ---------------------------------------------------------------- 2. 결정 KPI 카드 (Stripe형)
S.append(f'''
<section class="slide">
  <div class="pad" style="height:100%">
    <div class="kick">결정 요약</div>
    <div class="kpi">
      <div class="card hero"><div class="lab">노출</div><div class="ctx">상단 동시 노출 상한</div>
        <div class="v">1<em>건</em></div>
        <div class="spark">{SPARK["exposure"]}</div>
        <div class="delta good">{IC_CHK}<span>확인한 14곳 전부 일치</span></div></div>
      <div class="card"><div class="lab">유지</div><div class="ctx">미열람 자동 정리 시점</div>
        <div class="v">14<em>일</em></div>
        <div class="spark">{SPARK["retention"]}</div>
        <div class="delta acc">{IC_CLK}<span>열람 즉시 해제가 업계 기본</span></div></div>
      <div class="card"><div class="lab">넘김</div><div class="ctx">자동 회전 제외, 수동 전환</div>
        <div class="v txt">화살표</div>
        <div class="spark">{SPARK["clicks"]}</div>
        <div class="delta alert">{IC_UP}<span>클릭의 84%가 첫 칸 집중</span></div></div>
      <div class="card"><div class="lab">검증</div><div class="ctx">배포 후 재판정 시점</div>
        <div class="v txt">D+60</div>
        <div class="spark">{SPARK["verify"]}</div>
        <div class="delta neut">{IC_CAL}<span>두 번째 공지 도달률 기준</span></div></div>
    </div>
  </div>
  <div class="folio">AMS 챗봇 알림 바, 결정과 근거</div><div class="pno">02</div>
</section>''')

# ---------------------------------------------------------------- 3. 회의가 못 정한 세 가지 (3열 카드)
S.append(f'''
<section class="slide">
  <div class="pad" style="height:100%">
    <div class="kick">출발점</div>
    <h2 style="max-width:980px">7월 15일 회의가 정하지 못한 세 가지</h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:44px;height:340px">
      <div class="mini"><div class="ml">물음 하나</div>
        <div style="font-size:26px;font-weight:750;letter-spacing:-.02em;margin-top:16px;line-height:1.35">몇 건을<br>보여줄 것인가</div>
        <div style="display:flex;gap:10px;margin-top:22px">
          <span style="background:var(--acc-soft);color:#173ba6;font-size:14px;font-weight:800;border-radius:11px;padding:7px 16px">3개 안</span>
          <span style="align-self:center;font-size:12px;color:var(--ink3);font-weight:700">대</span>
          <span style="background:var(--fill);color:#3f4450;font-size:14px;font-weight:800;border-radius:11px;padding:7px 16px">10개 안</span>
        </div>
        <div class="md">상단 후보 수와 목록 수가 한 논의로 섞여 있었습니다</div></div>
      <div class="mini"><div class="ml">물음 둘</div>
        <div style="font-size:26px;font-weight:750;letter-spacing:-.02em;margin-top:16px;line-height:1.35">얼마나 두었다<br>내릴 것인가</div>
        <div style="display:flex;gap:10px;margin-top:22px">
          <span style="background:var(--acc-soft);color:#173ba6;font-size:14px;font-weight:800;border-radius:11px;padding:7px 16px">1주 안</span>
          <span style="align-self:center;font-size:12px;color:var(--ink3);font-weight:700">대</span>
          <span style="background:var(--fill);color:#3f4450;font-size:14px;font-weight:800;border-radius:11px;padding:7px 16px">2주 안</span>
        </div>
        <div class="md">업계가 무엇을 기준으로 내리는지부터 확인이 필요했습니다</div></div>
      <div class="mini"><div class="ml">물음 셋</div>
        <div style="font-size:26px;font-weight:750;letter-spacing:-.02em;margin-top:16px;line-height:1.35">여러 건이면<br>어떻게 넘길 것인가</div>
        <div style="display:flex;gap:10px;margin-top:22px">
          <span style="background:var(--fill);color:#3f4450;font-size:14px;font-weight:800;border-radius:11px;padding:7px 16px">자동 회전</span>
          <span style="align-self:center;font-size:12px;color:var(--ink3);font-weight:700">대</span>
          <span style="background:var(--acc-soft);color:#173ba6;font-size:14px;font-weight:800;border-radius:11px;padding:7px 16px">수동 전환</span>
        </div>
        <div class="md">자동 롤링의 기대는 있었지만 효과는 검증된 적이 없었습니다</div></div>
    </div>
  </div>
  <div class="folio">AMS 챗봇 알림 바, 결정과 근거</div><div class="pno">03</div>
</section>''')

# ---------------------------------------------------------------- 4. 근거1 노출 (상단 밴드 + 카드 행)
S.append(f'''
<section class="slide ev">
  <div class="pad" style="height:100%">
    <div style="margin-bottom:24px">
      <div class="kick" style="margin-bottom:12px">근거 1, 노출 건수</div>
      <h2 style="font-size:40px;max-width:900px">상단 동시 노출은 <span class="hl">어디를 봐도 1건</span>이었다</h2>
      <p class="sub">컨플루언스와 카카오, 머티리얼 디자인, 텔레그램까지 전부 한 건. <b>우리 바 한 건도 이미 적극적인 노출입니다.</b></p>
    </div>
    <div class="crow">
      {CARD["exposure"]}
      <div class="stack">
        <div class="mini"><div class="ml">동시 2건 이상</div><div class="mv">0<em>곳</em></div>
          <div class="md">구글 머티리얼 디자인은 두 개를 쌓은 화면을 금지 예시로 걸어 두었습니다</div></div>
        <div class="mini"><div class="ml">정책 확인</div><div class="mv">14<em>곳</em></div>
          <div class="md">공식 문서 근거와 실제 위젯 실측을 함께 확인했습니다</div></div>
      </div>
    </div>
  </div>
  <div class="folio">AMS 챗봇 알림 바, 결정과 근거</div><div class="pno">04</div>
</section>''')

# ---------------------------------------------------------------- 5. 구조 확정 (1·2·10)
S.append(f'''
<section class="slide">
  <div class="pad" style="height:100%">
    <div class="kick">결정, 노출 구조</div>
    <h2 style="max-width:980px">바에 <span class="hl">1건</span>, 뒤에 <span class="hl">2건</span>, 목록에 <span class="hl">10건</span>이 함께 삽니다</h2>
    <div style="margin-top:40px">{CARD["structure"]}</div>
  </div>
  <div class="folio">AMS 챗봇 알림 바, 결정과 근거</div><div class="pno">05</div>
</section>''')

# ---------------------------------------------------------------- 6. 근거2 기간 (상단 밴드 + 카드 행)
S.append(f'''
<section class="slide ev">
  <div class="pad" style="height:100%">
    <div style="margin-bottom:24px">
      <div class="kick" style="margin-bottom:12px">근거 2, 유지 기간</div>
      <h2 style="font-size:40px;max-width:900px">업계는 기간이 아니라 <span class="hl">열람으로 내린다</span></h2>
      <p class="sub">인앱 공지 SaaS 열한 곳 전부 보면 꺼지는 방식. <b>14일과 30일은 업계 값 사이에서 우리가 정한 값입니다.</b></p>
    </div>
    <div class="crow">
      {CARD["retention"]}
      <div class="stack">
        <div class="mini"><div class="ml">인앱 공지 SaaS</div><div class="mv">11<em>곳</em></div>
          <div class="md">비머, 캐니, 펜도 전부 열람 즉시 해제 방식입니다</div></div>
        <div class="mini"><div class="ml">기간을 명시한 곳</div><div class="mv">2<em>곳</em></div>
          <div class="md">유튜브 4주와 스포티파이 60일, 그 사이에서 우리 값을 정했습니다</div></div>
      </div>
    </div>
  </div>
  <div class="folio">AMS 챗봇 알림 바, 결정과 근거</div><div class="pno">06</div>
</section>''')

# ---------------------------------------------------------------- 7. 근거3 회전 (상단 밴드 + 카드 행)
S.append(f'''
<section class="slide ev">
  <div class="pad" style="height:100%">
    <div style="margin-bottom:24px">
      <div class="kick" style="margin-bottom:12px">근거 3, 넘김 방식</div>
      <h2 style="font-size:40px;max-width:900px">자동으로 돌리면 <span class="off">첫 건만 읽힌다</span></h2>
      <p class="sub">쇼피파이 기본 테마조차 자동 회전이 꺼진 채 출고됩니다. <b>기본은 화살표, 자동은 제외합니다.</b> 자동이 꼭 필요해지면 6초 간격, 진행 표시, 정지 버튼 상시 제공, 마우스 오버 시 정지, 조작 시 완전 꺼짐, 모바일 제외 조건에서만 엽니다.</p>
    </div>
    <div class="crow">
      {CARD["clicks"]}
      <div class="stack">
        <div class="mini"><div class="ml">클릭한 방문자</div><div class="mv warm">1<em>%</em></div>
          <div class="md">노터데임대 실측, 전체 방문자 기준입니다</div></div>
        <div class="mini"><div class="ml">한 칸이 보이는 시간</div><div class="mv warm">20<em>%</em></div>
          <div class="md">닐슨노먼그룹 테스트, 다섯 칸 회전 기준. 98포인트 안내도 끝내 찾지 못했습니다</div></div>
      </div>
    </div>
  </div>
  <div class="folio">AMS 챗봇 알림 바, 결정과 근거</div><div class="pno">07</div>
</section>''')

# ---------------------------------------------------------------- 8. 운영 원칙 (심각도, 전폭)
S.append(f'''
<section class="slide ev">
  <div class="pad" style="height:100%">
    <div style="margin-bottom:24px">
      <div class="kick" style="margin-bottom:12px">따라 나온 원칙</div>
      <h2 style="font-size:40px;max-width:900px"><span class="hl">심각도</span>가 놓일 자리를 정한다</h2>
      <p class="sub">ChatGPT와 클로드, 안드로이드 전부 같은 분리. <b>우리 Notification의 Status 변형과 그대로 맞물립니다.</b></p>
    </div>
    {CARD["severity"]}
  </div>
  <div class="folio">AMS 챗봇 알림 바, 결정과 근거</div><div class="pno">08</div>
</section>''')

# ---------------------------------------------------------------- 9. 반례 YBM (이미지 + 미니)
S.append(f'''
<section class="slide ev">
  <div class="pad" style="height:100%">
    <div style="margin-bottom:24px">
      <div class="kick" style="margin-bottom:12px">반례 검토</div>
      <h2 style="font-size:40px;max-width:900px">반례는 <span class="hl">하나</span> 있었고, 정직하게 다룹니다</h2>
      <p class="sub">자동 회전을 기본으로 켠 곳은 YBM 클라우드 하나. <b>게시 속도가 달라 회전은 제외하고, 구조 두 가지만 가져왔습니다.</b></p>
    </div>
    <div class="crow" style="grid-template-columns:700px 1fr">
      <div class="imgpanel" style="height:400px;background:#f6f7fa"><img src="{img('ybm_rolling.jpg')}" alt="YBM 클라우드 메인의 공지 롤링 영역 실측 캡처"></div>
      <div class="stack">
        <div class="mini"><div class="ml">YBM 게시 간격</div><div class="mv warm">2~3<em>일</em></div>
          <div class="md">한 건꼴 실측. 우리 위키 공지 주기보다 훨씬 빠릅니다</div></div>
        <div class="mini"><div class="ml">차용한 구조</div><div class="mv">2<em>가지</em></div>
          <div class="md">공지와 업데이트를 나눈 슬롯, 신규와 개선을 가른 태그</div></div>
      </div>
    </div>
  </div>
  <div class="folio">AMS 챗봇 알림 바, 결정과 근거</div><div class="pno">09</div>
</section>''')

# ---------------------------------------------------------------- 10. 정책 매트릭스 (카드 표)
S.append(f'''
<section class="slide">
  <div class="pad">
    <div class="kick">한 장으로 보는 근거</div>
    <h2 style="max-width:900px">서비스별 공지 정책 매트릭스</h2>
    <div class="card" style="margin-top:24px;padding:8px 24px 16px">
    <table>
      <thead><tr><th>서비스</th><th>상단 동시 노출</th><th>여러 건은 어디에</th><th>넘김 방식</th><th>내리는 기준</th></tr></thead>
      <tbody>
        <tr><td>컨플루언스<span class="tdd">아틀라시안 협업 문서 도구</span></td><td><span class="one">1건</span></td><td></td><td></td><td>수정하면 다시 노출</td></tr>
        <tr><td>카카오<span class="tdd">카카오톡 채팅방 공지</span></td><td><span class="one">1건</span></td><td>새 공지가 대체</td><td></td><td>닫으면 다시 안 열림</td></tr>
        <tr><td>텔레그램<span class="tdd">글로벌 메신저</span></td><td><span class="one">1건</span></td><td>별도 페이지</td><td>탭하면 다음(수동)</td><td></td></tr>
        <tr><td>인터콤<span class="tdd">고객 메시징 위젯</span></td><td><span class="one">1건</span></td><td>뉴스 탭</td><td></td><td><span class="keep">열람</span></td></tr>
        <tr><td>쇼피파이 Dawn<span class="tdd">커머스 플랫폼 기본 테마</span></td><td><span class="one">1건 표시</span></td><td>최대 12건 큐</td><td>화살표, 자동은 꺼짐</td><td></td></tr>
        <tr><td>캔버스<span class="tdd">대학 학습관리시스템</span></td><td></td><td>목록 10건</td><td></td><td><span class="keep">열람</span> 배지</td></tr>
        <tr><td>비머<span class="tdd">인앱 공지 전문 SaaS</span></td><td></td><td>피드</td><td></td><td><span class="keep">열람</span> 즉시 배지 소멸</td></tr>
        <tr><td>세일즈포스<span class="tdd">기업용 CRM</span></td><td>하루 1건 지연</td><td></td><td></td><td>반복 30회, 간격 30일 상한</td></tr>
        <tr><td>젠데스크<span class="tdd">고객상담 위젯</span></td><td><span class="none">위젯 공지 없음</span></td><td></td><td></td><td></td></tr>
        <tr class="ours"><td>우리 결정<span class="tdd" style="color:#3a5cc4">AMS 챗봇 알림 바</span></td><td><span class="one">1건 + 대기 2건</span></td><td>목록 10건</td><td>화살표, 자동 제외</td><td><span class="keep">열람</span> 즉시, 미열람 14일, 상한 30일</td></tr>
      </tbody>
    </table>
    <div class="cf">구글 머티리얼 디자인과 GOV.UK, 유튜브, 스포티파이 등 서른 곳 남짓의 전체 확인 내역은 부록 근거 자료에 있습니다</div>
    </div>
  </div>
  <div class="folio">AMS 챗봇 알림 바, 결정과 근거</div><div class="pno">10</div>
</section>''')

# ---------------------------------------------------------------- 11. 거버넌스 (전폭 게이트 + 결정 칩)
S.append(f'''
<section class="slide ev">
  <div class="pad" style="height:100%">
    <div style="margin-bottom:20px">
      <div class="kick" style="margin-bottom:12px">거버넌스 결정 3</div>
      <h2 style="font-size:40px;max-width:940px">운영이 유지되도록 <span class="hl">세 가지를 확정합니다</span></h2>
    </div>
    <div class="chiprow">
      <div class="dchip"><span class="dn">1</span>바로가기를 눌러도 그 공지는 소진</div>
      <div class="dchip"><span class="dn">2</span>MYCLASS는 게시 기준만 분리</div>
      <div class="dchip"><span class="dn">3</span>기획자가 쓰고 운영 UX가 거른다</div>
    </div>
    <div style="margin-top:20px">{CARD["gate"]}</div>
  </div>
  <div class="folio">AMS 챗봇 알림 바, 결정과 근거</div><div class="pno">11</div>
</section>''')

# ---------------------------------------------------------------- 12. 적용 스펙
S.append(f'''
<section class="slide">
  <div class="pad">
    <div class="kick">적용 스펙</div>
    <h2 style="max-width:940px">지금 할 것과 개발이 붙어야 할 것</h2>
    <div class="spec2">
      <div class="col"><div class="tb" style="background:var(--good)"></div>
        <div class="sh" style="color:var(--good)">지금 적용</div><div class="ss">디자인과 정책만으로</div>
        <div class="row"><dt>노출 구조</dt><dd>바 <b>1건</b>에 대기 2건, 합 3건 상한. 넘치면 전체 보기로</dd></div>
        <div class="row"><dt>전환</dt><dd><b>현재 위치와 좌우 화살표</b>, 모바일 스와이프. 자동 없음</dd></div>
        <div class="row"><dt>해제</dt><dd>닫기나 바로가기로 소진, 다 소진되면 바 접힘</dd></div>
        <div class="row"><dt>심각도</dt><dd>대화 오류 인라인, 장애는 <b>error 바 단독에 닫기 없음</b></dd></div>
        <div class="row"><dt>사전 고지</dt><dd>화면이나 절차가 바뀌는 변경은 배포 전에 미리 알림</dd></div>
        <div class="row"><dt>문구</dt><dd>모바일 열다섯 자 안팎, 홈과 온보딩만. 오류 문구는 운영 문서로</dd></div>
        <div class="row"><dt>구현</dt><dd><b>Notification 마스터 무손상</b>, 래퍼에서 인스턴스 교체</dd></div>
      </div>
      <div class="col"><div class="tb" style="background:var(--acc)"></div>
        <div class="sh" style="color:var(--acc2)">개발 연동</div><div class="ss">서버 작업이 필요한 항목</div>
        <div class="row"><dt>열람 저장</dt><dd><b>계정 기준 저장</b>이 나머지 전부의 전제 <span class="pri p1">1순위</span><span class="pri sz">공수 큼</span></dd></div>
        <div class="row"><dt>기간 해제</dt><dd>미열람 14일, 상한 30일 자동. 게시 예약 <span class="pri sz">공수 중간</span></dd></div>
        <div class="row"><dt>재노출</dt><dd>내용 수정 시 열람 상태 되돌림 <span class="pri sz">공수 작음</span></dd></div>
        <div class="row"><dt>우선순위</dt><dd>오류 먼저, 진행 중 대화, 미열람, 열람 순 <span class="pri sz">공수 중간</span></dd></div>
        <div class="row"><dt>게시 운영</dt><dd>빈도 상한 어드민화, 세 갈래 분류 필터 <span class="pri sz">공수 작음</span></dd></div>
        <div class="row"><dt>접근성</dt><dd>모션 최소화 설정 시 자동 넘김 비활성 <span class="pri sz">공수 작음</span></dd></div>
        <div class="row"><dt>측정</dt><dd>노출과 클릭, 닫기, <b>두 번째 공지 도달률</b> <span class="pri sz">공수 중간</span></dd></div>
      </div>
    </div>
  </div>
  <div class="folio">AMS 챗봇 알림 바, 결정과 근거</div><div class="pno">12</div>
</section>''')

# ---------------------------------------------------------------- 13. 검증 D+60 (카드 + 미니)
S.append(f'''
<section class="slide ev">
  <div class="pad" style="height:100%">
    <div style="margin-bottom:24px">
      <div class="kick" style="margin-bottom:12px">검증과 되돌림</div>
      <h2 style="font-size:40px;max-width:940px">맞았는지 확인하는 방법까지 <span class="hl">정해 둡니다</span></h2>
      <p class="sub">방향은 외부 사례로, 판정은 우리 데이터로. <b>배포 60일 뒤 두 번째 공지 도달률이 기준입니다.</b></p>
    </div>
    <div class="crow">
      {CARD["dependency"]}
      <div class="stack">
        <div class="mini"><div class="ml">판정 시점</div><div class="mv">D+60</div>
          <div class="md">두 번째 공지 도달률이 유의미하게 낮은지 봅니다</div></div>
        <div class="mini"><div class="ml">미달 시 롤백</div><div class="mv">1<em>건</em></div>
          <div class="md">대기 큐를 접고 바 1건 단독으로 되돌립니다</div></div>
      </div>
    </div>
  </div>
  <div class="folio">AMS 챗봇 알림 바, 결정과 근거</div><div class="pno">13</div>
</section>''')

# ---------------------------------------------------------------- 14. 화면 반영 (폰 + 미니)
S.append(f'''
<section class="slide ev">
  <div class="pad" style="height:100%">
    <div style="margin-bottom:24px">
      <div class="kick" style="margin-bottom:12px">화면 반영</div>
      <h2 style="font-size:40px;max-width:940px">확정 스펙을 <span class="hl">대표 화면에 반영했습니다</span></h2>
      <p class="sub">Notification 마스터 무손상, 래퍼에서 인스턴스 교체. <b>문구는 AMS 위키의 실제 항목입니다.</b></p>
    </div>
    <div class="crow" style="grid-template-columns:1fr 300px 1fr;gap:24px">
      <div class="stack">
        <div class="mini"><div class="ml">반영 화면</div><div class="mv" style="font-size:40px;margin-top:20px">01-1</div>
          <div class="md">온보딩 검색. 전체 보기 목록과 상태 세트까지 같은 기준</div></div>
        <div class="mini"><div class="ml">첫 소식</div><div class="mv" style="font-size:40px;margin-top:20px">7월 17일</div>
          <div class="md">회원상세 배부현황 일괄 배부처리, 위키 실제 항목</div></div>
      </div>
      <div class="imgpanel" style="height:420px;background:#f6f7fa"><img src="{img('screen_after.png', EXTRA)}" alt="확정 스펙이 반영된 AMS 챗봇 화면" style="object-fit:contain"></div>
      <div class="stack">
        <div class="mini"><div class="ml">디자인 시스템</div><div class="mv" style="font-size:40px;margin-top:20px">DS 100%</div>
          <div class="md">140개 fill 전수 바인딩, myclass.designsystem 토큰</div></div>
        <div class="mini"><div class="ml">동작 시안</div><div class="mv" style="font-size:40px;margin-top:20px">HTML</div>
          <div class="md">AMS챗봇_알림바_인터랙션시안_최종.html에서 직접 조작</div></div>
      </div>
    </div>
  </div>
  <div class="folio">AMS 챗봇 알림 바, 결정과 근거</div><div class="pno">14</div>
</section>''')

# ---------------------------------------------------------------- 15. 요청 (풀블리드 블루)
S.append(f'''
<section class="slide blue">
  <div class="pad" style="height:100%;display:grid;grid-template-columns:1fr 320px;gap:64px;align-items:center">
    <div>
      <div class="kick">요청 사항</div>
      <h2>열람 상태의 계정 기준 저장을<br>다음 스프린트에 배정해 주시기 바랍니다</h2>
      <p class="body">이 한 건이 미열람 14일 해제와 수정 시 재노출, 오류 우선 순서, 도달률 측정까지 네 가지의 선행 조건입니다. 디자인과 정책 항목은 다음 배포에 바로 실을 수 있고, 나머지 개발 항목은 이 건 뒤에 후순위로 이어집니다.</p>
      <div class="meta" style="margin-top:40px">
        <span>담당 <b>플랫폼서비스실 김명준</b></span>
        <span>결정 시점 <b>다음 운영 배포 일정 확정 전</b></span>
        <span>공수 <b>큼, 상세 산정은 개발 리드와 협의</b></span>
      </div>
    </div>
    <div style="text-align:center">
      <div style="font-size:280px;font-weight:800;line-height:.9;letter-spacing:-.04em;color:#ffffff">4</div>
      <div style="margin-top:14px;font-size:17px;font-weight:600;color:#dde6ff;letter-spacing:.06em">선행 조건이 이 한 건에 걸립니다</div>
    </div>
  </div>
  <div class="folio">AMS 챗봇 알림 바, 결정과 근거</div><div class="pno">15</div>
</section>''')

# ---------------------------------------------------------------- 16. 근거 자료
S.append(f'''
<section class="slide">
  <div class="pad">
    <div class="kick">부록</div>
    <h2>근거 자료</h2>
    <div class="card" style="margin-top:26px;padding:28px 32px">
    <div class="refs">
      <div><span class="rn">1</span><b>Atlassian 컨플루언스 관리자 문서.</b> 활성 배너 1건과 수정 시 재노출. support.atlassian.com</div>
      <div><span class="rn">2</span><b>카카오 고객센터.</b> 채팅방 상단 공지 1건. cs.kakao.com</div>
      <div><span class="rn">3</span><b>머티리얼 디자인 배너 가이드.</b> 복수 배너 금지 예시. m3.material.io</div>
      <div><span class="rn">4</span><b>텔레그램 공식 블로그.</b> 상단 1건 표시와 탭 전환. telegram.org</div>
      <div><span class="rn">5</span><b>인터콤 공식 문서.</b> 홈 카드와 뉴스 공간. intercom.com</div>
      <div><span class="rn">6</span><b>고객상담 위젯 젠데스크와 프레시챗 문서, 채널톡 실측.</b> 위젯 내 공지 부재</div>
      <div><span class="rn">7</span><b>캔버스 커뮤니티 문서.</b> 릴리스 노트 10건과 New 배지. community.canvaslms.com</div>
      <div><span class="rn">8</span><b>인앱 공지 SaaS 비머 자사 위젯 실측.</b> 열람 즉시 배지 소멸</div>
      <div><span class="rn">9</span><b>세일즈포스 인앱 안내 고려사항.</b> 하루 1건과 반복 상한. help.salesforce.com</div>
      <div><span class="rn">10</span><b>노터데임대 웹팀 실측.</b> 클릭 1퍼센트와 첫 위치 84퍼센트. nd.edu</div>
      <div><span class="rn">11</span><b>닐슨노먼그룹.</b> 자동 회전 비판. nngroup.com</div>
      <div><span class="rn">12</span><b>쇼피파이 Dawn 소스.</b> 자동 회전 기본 꺼짐. github.com/Shopify/dawn</div>
      <div><span class="rn">13</span><b>WCAG 2.2 성공 기준 2.2.2.</b> 움직이는 콘텐츠의 정지 수단. w3.org</div>
      <div><span class="rn">14</span><b>OpenAI 상태 페이지, 클로드 오류 문서, 안드로이드 개발자 문서.</b> 심각도별 자리 분리</div>
      <div><span class="rn">15</span><b>채널톡 사용 가이드.</b> 상담 답변이 팝업보다 우선. docs.channel.io</div>
      <div><span class="rn">16</span><b>온보딩 도구 앱큐스, 제품 분석 펜도, 마케팅 자동화 브레이즈 문서.</b> 겹침과 빈도의 설정화</div>
      <div><span class="rn">17</span><b>애플 휴먼 인터페이스 가이드, GOV.UK 배너 가이드.</b> 재노출 금지와 절제</div>
    </div>
    <div class="cf">위젯 제품인 비머와 채널톡, 인터콤은 문서 대신 실제 위젯을 열어 관찰했습니다. 재보지 못한 값은 추정하지 않고 그대로 남겼습니다. 원문 주소 전체와 검증 경로는 심층판 260718 케이스 스터디와 적용안(7월 20일 증보)에 있습니다</div>
    </div>
    <div class="meta" style="margin-top:26px"><span><b>김명준 · UX/UI Design · 플랫폼서비스실</b></span><span>2026년 7월 20일</span></div>
  </div>
  <div class="folio">AMS 챗봇 알림 바, 결정과 근거</div><div class="pno">16</div>
</section>''')

HTML = f'''<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AMS 챗봇 알림 바, 결정과 근거</title>
<style>{CSS}</style>
</head>
<body>
{"".join(S)}
</body>
</html>'''

out = os.path.join(BASE, "260720_AMS챗봇_알림바_결정과근거_덱.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(HTML)
print("written", out, os.path.getsize(out), "bytes, slides:", len(S))
