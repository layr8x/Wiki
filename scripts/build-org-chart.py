#!/usr/bin/env python3
"""조직도 한 장을 만든다.

저장소를 훑어 docs/org-chart.html 을 다시 쓴다. 손으로 고치지 않는다.
읽는 곳: .claude-plugin/marketplace.json (부서 목록) / plugins/*/skills/*/SKILL.md (스킬 이름과 설명)

디자인 방향: 신문 편집국 조판. 크림색 지면, 세리프 제호, 헤어라인 괘선, 검사역은 붉은 인장.
사용: python3 scripts/build-org-chart.py
"""
import json, re, html
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'org-chart.html'
BLOCKERS = {'plain', 'verify'}   # 막을 권한이 있는 부서

# 아직 안 옮긴 부서에 들어갈 CLAUDE.md 장. 카드의 빈 자리를 이걸로 채운다
PLANNED = {
    'numbers':   [('16장', '카카오 상담 5채널 정본'), ('1장', '분석 방법론과 측정·추정 구분')],
    'screens':   [('13장', '챗봇 디자인시스템 토큰'), ('18장', 'Astryx 컴포넌트 규칙'),
                  ('23장', '관리자 표가 잘리는 두 원인'), ('8장', '텍스트 넘침 함정')],
    'verify':    [('15장', '화면 정합 실패의 근본 원인'), ('14장', '디자인 대조 툴킷'),
                  ('9장', '실제 웹 화면 재현')],
    'keepalive': [('22장', '수집이 멈췄을 때 진단 순서'), ('17장', '수집 기기와 인프라')],
}

CSS = """
@font-face{font-family:'PretendardLocal';src:url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/woff2/PretendardVariable.woff2') format('woff2-variations');font-weight:45 920;font-display:swap}
:root{
  --paper:#faf7f2; --sheet:#fffdfa; --ink:#14120f;
  --dim:rgba(20,18,15,.66); --faint:rgba(20,18,15,.40); --ghost:rgba(20,18,15,.20);
  --rule:rgba(20,18,15,.14); --rule2:rgba(20,18,15,.28);
  --stamp:#a8321e; --link:#1a4fa0;
  --sans:'PretendardLocal',Pretendard,-apple-system,'Segoe UI',system-ui,sans-serif;
  --serif:'Iowan Old Style','Palatino Linotype',Palatino,Georgia,'Times New Roman',serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,'Liberation Mono',monospace;
}
@media(prefers-color-scheme:dark){:root{
  --paper:#100f0d; --sheet:#181613; --ink:#f2ede4;
  --dim:rgba(242,237,228,.68); --faint:rgba(242,237,228,.42); --ghost:rgba(242,237,228,.18);
  --rule:rgba(242,237,228,.14); --rule2:rgba(242,237,228,.26);
  --stamp:#e07357; --link:#8fb4ee;
}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);
  font-size:15px;line-height:1.62;-webkit-font-smoothing:antialiased;
  font-feature-settings:'ss05' 1,'ss06' 1}
.paper{max-width:1160px;margin:0 auto;padding:0 28px 96px}

/* 제호 */
.masthead{padding:72px 0 0}
.kicker{margin:0 0 18px;font-size:11px;letter-spacing:.22em;text-transform:uppercase;
  color:var(--faint);font-weight:600}
.masthead h1{margin:0;font-family:var(--serif);font-weight:400;
  font-size:clamp(72px,13vw,148px);line-height:.82;letter-spacing:-.035em}
.rule-double{margin:26px 0 0;border-top:2px solid var(--ink);
  border-bottom:1px solid var(--ink);height:5px}
.edition{display:flex;flex-wrap:wrap;gap:0;margin:0;padding:11px 0 0;
  font-size:11.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--faint);font-weight:600}
.edition span{padding-right:16px;margin-right:16px;border-right:1px solid var(--rule)}
.edition span:last-child{border-right:0;margin-right:0;padding-right:0}

/* 사설 판 (어두운 판으로 리듬을 만든다) */
.standfirst{margin:40px 0 0;background:var(--ink);color:var(--paper);padding:40px 44px 44px;
  position:relative;overflow:hidden}
.standfirst::after{content:'';position:absolute;inset:auto 0 0 0;height:1px;
  background:linear-gradient(90deg,var(--stamp) 0 22%,transparent 22%)}
.standfirst .role{margin:0 0 14px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;
  opacity:.62;font-weight:600}
.standfirst .lede{margin:0;font-family:var(--serif);font-size:clamp(22px,2.6vw,32px);
  line-height:1.42;letter-spacing:-.01em;max-width:24em}
.standfirst .lede b{font-weight:400;color:#fff;box-shadow:inset 0 -.42em 0 rgba(168,50,30,.55);
  -webkit-box-decoration-break:clone;box-decoration-break:clone}
.standfirst .lede{word-break:keep-all;text-wrap:pretty}
@media(prefers-color-scheme:dark){.standfirst .lede b{color:var(--paper)}}

/* 도구 막대 */
.toolbar{position:sticky;top:0;z-index:9;display:flex;gap:10px;flex-wrap:wrap;
  background:var(--paper);padding:16px 0;margin-top:8px;border-bottom:1px solid var(--rule)}
input[type=search]{flex:1;min-width:200px;padding:11px 15px;border:1px solid var(--rule2);
  border-radius:2px;background:var(--sheet);color:var(--ink);font:inherit;font-size:14px}
input[type=search]::placeholder{color:var(--faint)}
input[type=search]:focus{outline:2px solid var(--ink);outline-offset:-1px}
.toolbar button{padding:11px 18px;border:1px solid var(--rule2);border-radius:2px;
  background:var(--sheet);color:var(--dim);font:inherit;font-size:12px;font-weight:600;
  letter-spacing:.08em;cursor:pointer}
.toolbar button[aria-pressed=true]{background:var(--ink);color:var(--paper);border-color:var(--ink)}

/* 단 제목 */
.band{margin-top:52px}
.band-title{display:flex;align-items:baseline;gap:14px;margin:0 0 22px;
  padding-bottom:11px;border-bottom:1px solid var(--ink)}
.band-title span{font-size:19px;font-weight:700;letter-spacing:-.01em}
.band-title em{font-style:normal;font-size:12px;letter-spacing:.13em;text-transform:uppercase;
  color:var(--faint);font-weight:600}
.band-title .tick{margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--faint)}

/* 부서 카드 */
.grid{display:grid;gap:0}
.grid.two{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
.grid.four{grid-template-columns:repeat(auto-fit,minmax(258px,1fr))}
.dept{position:relative;background:var(--sheet);padding:26px 24px 24px;
  border-top:1px solid var(--ink);border-right:1px solid var(--rule);
  border-bottom:1px solid var(--rule)}
.grid .dept:last-child{border-right:0}
.dept.blocker{border-top:3px solid var(--stamp)}
.folio{position:absolute;top:20px;right:20px;font-family:var(--serif);font-size:34px;
  line-height:1;color:var(--ghost);letter-spacing:-.02em}
.dept .name{margin:0;font-size:21px;font-weight:700;letter-spacing:-.012em}
.dept .slug{font-family:var(--mono);font-size:11.5px;font-weight:400;color:var(--faint);
  margin-left:7px;letter-spacing:0}
.dept .meta{margin:7px 0 0;font-size:11px;letter-spacing:.13em;text-transform:uppercase;
  color:var(--faint);font-weight:600}
.dept.blocker .meta{color:var(--stamp)}
.dept .desc{margin:15px 0 0;font-size:14px;line-height:1.66;color:var(--dim);max-width:34em}
.cmd{display:block;width:100%;margin-top:18px;padding:10px 12px;text-align:left;
  font-family:var(--mono);font-size:11px;color:var(--dim);background:transparent;
  border:1px dashed var(--rule2);border-radius:2px;cursor:pointer;
  white-space:nowrap;overflow-x:auto;letter-spacing:-.01em}
.cmd:hover{border-style:solid;color:var(--ink)}
.cmd.done{border-style:solid;border-color:var(--stamp);color:var(--stamp)}

/* 스킬 색인 */
.skills{list-style:none;counter-reset:s;margin:20px 0 0;padding:16px 0 0;
  border-top:1px solid var(--rule)}
.skills li{counter-increment:s;padding:9px 0 9px 26px;position:relative;
  border-bottom:1px dotted var(--rule2)}
.skills li:last-child{border-bottom:0;padding-bottom:0}
.skills li::before{content:counter(s,decimal-leading-zero);position:absolute;left:0;top:10px;
  font-family:var(--mono);font-size:10px;color:var(--faint)}
.skills a{color:var(--ink);text-decoration:none;font-weight:600;font-size:13.5px;
  border-bottom:1px solid var(--rule2)}
.skills a:hover{border-color:var(--ink)}
.skills p{margin:3px 0 0;font-size:12.5px;line-height:1.55;color:var(--faint)}
.dept.pending{background:var(--paper)}
.dept.pending .name,.dept.pending .folio{opacity:.72}
.planned{list-style:none;margin:20px 0 0;padding:16px 0 0;border-top:1px solid var(--rule)}
.planned .head{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);
  font-weight:600;margin-bottom:10px}
.planned li{padding:7px 0;font-size:12.5px;color:var(--faint);line-height:1.5;
  border-bottom:1px dotted var(--rule)}
.planned li:last-child{border-bottom:0}
.planned b{font-family:var(--mono);font-size:11px;font-weight:400;color:var(--ghost);
  margin-right:8px}

.none{padding:64px 0;text-align:center;color:var(--faint);font-family:var(--serif);font-size:20px}
.colophon{margin-top:64px;padding-top:20px;border-top:2px solid var(--ink);
  display:flex;flex-wrap:wrap;gap:8px 28px;font-size:11.5px;color:var(--faint);line-height:1.8}
.colophon code{font-family:var(--mono);font-size:11px;color:var(--dim)}
[hidden]{display:none!important}
@media(max-width:640px){
  .paper{padding:0 18px 64px}
  .standfirst{padding:28px 22px 30px}
  .grid .dept{border-right:0}
}
"""

JS = """
const q=document.getElementById('q'),only=document.getElementById('only'),
      none=document.getElementById('none'),cards=[...document.querySelectorAll('.dept')],
      bands=[...document.querySelectorAll('.band')];
function apply(){
  const t=q.value.trim().toLowerCase(), b=only.getAttribute('aria-pressed')==='true';
  let n=0;
  cards.forEach(c=>{
    const ok=(!t||c.dataset.find.includes(t))&&(!b||c.classList.contains('blocker'));
    c.hidden=!ok; if(ok)n++;
  });
  bands.forEach(s=>{
    s.hidden=![...s.querySelectorAll('.dept')].some(c=>!c.hidden);
  });
  none.hidden=n>0;
}
q.addEventListener('input',apply);
only.addEventListener('click',()=>{
  only.setAttribute('aria-pressed',only.getAttribute('aria-pressed')!=='true');apply();});
document.querySelectorAll('.cmd').forEach(b=>b.addEventListener('click',()=>{
  navigator.clipboard?.writeText(b.dataset.copy);
  const o=b.textContent; b.textContent='복사됨'; b.classList.add('done');
  setTimeout(()=>{b.textContent=o;b.classList.remove('done');},1200);
}));
"""


def read_skills(slug):
    out = []
    for md in sorted((ROOT / 'plugins' / slug / 'skills').glob('*/SKILL.md')):
        text = md.read_text(encoding='utf-8')
        fm = re.match(r'^---\n(.*?)\n---', text, re.S)
        desc = ''
        if fm:
            d = re.search(r'^description:\s*(.+?)(?=\n\w+:|\Z)', fm.group(1), re.S | re.M)
            if d:
                desc = ' '.join(d.group(1).split())
        short = re.split(r'(?<=다)\.\s', desc)[0].rstrip('.') + '.'
        out.append((md.parent.name, short[:104] + ('…' if len(short) > 104 else ''),
                    str(md.relative_to(ROOT))))
    return out


def card(d, folio):
    e = html.escape
    if d['skills']:
        body = '<ol class="skills">' + ''.join(
            f'<li><a href="../{e(path)}">{e(name)}</a><p>{e(desc)}</p></li>'
            for name, desc, path in d['skills']) + '</ol>'
    else:
        rows = ''.join(f'<li><b>{e(ch)}</b>{e(t)}</li>' for ch, t in PLANNED.get(d['name'], []))
        body = ('<ul class="planned"><li class="head">CLAUDE.md에서 이전 예정</li>'
                + rows + '</ul>') if rows else ''
    find = ' '.join([d['name'], d['displayName'], d['description']] +
                    [n + ' ' + s for n, s, _ in d['skills']]).lower()
    meta = f"스킬 {len(d['skills'])}" + (' · 막을 권한' if d['blocker'] else '')
    cls = 'dept' + (' blocker' if d['blocker'] else '') + ('' if d['skills'] else ' pending')
    return f'''
      <article class="{cls}" data-find="{e(find)}">
        <span class="folio">{folio:02d}</span>
        <h3 class="name">{e(d['displayName'])}<span class="slug">{e(d['name'])}</span></h3>
        <p class="meta">{e(meta)}</p>
        <p class="desc">{e(d['description'])}</p>
        <button class="cmd" data-copy="/plugin install {e(d['name'])}@desk">/plugin install {e(d['name'])}@desk</button>
        {body}
      </article>'''


def build():
    mk = json.loads((ROOT / '.claude-plugin' / 'marketplace.json').read_text(encoding='utf-8'))
    depts = []
    for p in mk['plugins']:
        s = read_skills(p['name'])
        depts.append({**p, 'skills': s, 'blocker': p['name'] in BLOCKERS})
    total = sum(len(d['skills']) for d in depts)
    order = {d['name']: i + 1 for i, d in enumerate(depts)}

    blockers = [d for d in depts if d['blocker']]
    makers = [d for d in depts if not d['blocker']]
    b_html = ''.join(card(d, order[d['name']]) for d in blockers)
    m_html = ''.join(card(d, order[d['name']]) for d in makers)
    ver = mk.get('version', '0.1.0')

    page = f'''<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>desk 조직도</title>
<meta name="description" content="김명준의 개인 편집국. 만드는 부서와 막는 검사역.">
<style>{CSS}</style></head>
<body><div class="paper">

<header class="masthead">
  <p class="kicker">개인 편집국 · personal desk</p>
  <h1>desk</h1>
  <div class="rule-double"></div>
  <p class="edition"><span>제{ver}판</span><span>부서 {len(depts)}</span><span>스킬 {total}</span>
    <span>막을 권한 {len(blockers)}</span><span>{date.today().isoformat()}</span></p>
</header>

<section class="standfirst">
  <p class="role">김명준 · 플랫폼 UX 디자이너 겸 PO</p>
  <p class="lede">산출물의 목적은 정보 전달이 아니라 <b>결정을&nbsp;받아내는&nbsp;것</b>.
    검사역 둘이 통과시켜야 밖으로 나갑니다.</p>
</section>

<div class="toolbar">
  <input type="search" id="q" placeholder="부서나 스킬 검색" aria-label="부서나 스킬 검색">
  <button id="only" aria-pressed="false">검사역만</button>
</div>

<section class="band">
  <h2 class="band-title"><span>검사역</span><em>gatekeepers</em>
    <span class="tick">통과 못 하면 산출물이 나가지 않는다</span></h2>
  <div class="grid two">{b_html}</div>
</section>

<section class="band">
  <h2 class="band-title"><span>만드는 부서</span><em>desks</em>
    <span class="tick">산출물을 낸다</span></h2>
  <div class="grid four">{m_html}</div>
</section>

<p class="none" id="none" hidden>맞는 부서나 스킬이 없습니다.</p>

<footer class="colophon">
  <span><code>scripts/build-org-chart.py</code> 가 저장소를 읽어 자동 생성합니다. 직접 고치지 마세요.</span>
  <span>설치 <code>/plugin marketplace add layr8x/Wiki</code></span>
  <span>참고 사례 cbrock84/headcount</span>
</footer>
</div>
<script>{JS}</script></body></html>'''
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(page, encoding='utf-8')
    print(f'조직도 생성: {OUT.relative_to(ROOT)}  부서 {len(depts)} · 스킬 {total}')


if __name__ == '__main__':
    build()
