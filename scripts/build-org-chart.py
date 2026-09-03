#!/usr/bin/env python3
"""조직도 한 장을 만든다.

저장소를 훑어 docs/org-chart.html 을 다시 쓴다. 손으로 고치지 않는다.
읽는 곳: .claude-plugin/marketplace.json (부서 목록) / plugins/*/skills/*/SKILL.md (스킬 이름과 설명)
내보내는 곳: desk.local.json 의 out (없으면 docs/org-chart.html)

디자인 방향: 신문 편집국 조판. 크림색 지면, 세리프 제호, 헤어라인 괘선, 검사역은 붉은 인장.
사용: python3 scripts/build-org-chart.py
"""
import json, re, html
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = 'docs/org-chart.html'
BLOCKERS = {'plain', 'verify'}   # 막을 권한이 있는 부서

SWAPPABLE = {'site'}   # 직장이 바뀌면 갈아끼우는 부서

# 조직도의 단 구성. 다섯 분야가 가운데, 위에 묶는 층, 아래에 검사역과 현장
GROUPS = [
    ('편집장', 'chief desk', ['chief'], '의도를 고정하고 분야를 묶는다'),
    ('다섯 분야', 'five fields', ['persuade', 'product', 'screens', 'numbers', 'build'],
     '필요한 것만 불러 병행한다'),
    ('검사역', 'gatekeepers', ['plain', 'verify'], '통과 못 하면 산출물이 나가지 않는다'),
    ('현장', 'site', ['site'], '직장이 바뀌면 이 부서만 갈아끼운다'),
]


def load_local():
    """저장소마다 다른 값(설치 주소, 이전 예정 목록). 없으면 빈 값으로 돈다."""
    f = ROOT / '.claude-plugin' / 'desk.local.json'
    if not f.exists():
        return {}
    try:
        return json.loads(f.read_text(encoding='utf-8'))
    except Exception:
        return {}

CSS = """
@font-face{font-family:'PretendardLocal';
  src:__FONT_SRC__;
  font-weight:45 920;font-display:swap}
:root{
  --paper:#f7f4ee; --sheet:#fffefb; --tint:#f1ece3; --ink:#12100d;
  --dim:rgba(18,16,13,.66); --faint:rgba(18,16,13,.40); --ghost:rgba(18,16,13,.16);
  --rule:rgba(18,16,13,.12); --rule2:rgba(18,16,13,.26);
  --stamp:#a02d18; --stamp-soft:rgba(160,45,24,.10);
  --lift:0 1px 1px rgba(60,42,20,.05),0 3px 6px rgba(60,42,20,.05),0 10px 20px rgba(60,42,20,.045);
  --lift2:0 2px 3px rgba(60,42,20,.07),0 8px 16px rgba(60,42,20,.08),0 22px 44px rgba(60,42,20,.07);
  --sans:'PretendardLocal',Pretendard,-apple-system,'Segoe UI',system-ui,sans-serif;
  --serif:'Iowan Old Style','Palatino Linotype',Palatino,Georgia,'Times New Roman',serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,'Liberation Mono',monospace;
  --ease:cubic-bezier(.22,.61,.36,1);
}
@media(prefers-color-scheme:dark){:root{
  --paper:#0d0c0b; --sheet:#161412; --tint:#100f0d; --ink:#f0eae0;
  --dim:rgba(240,234,224,.66); --faint:rgba(240,234,224,.40); --ghost:rgba(240,234,224,.15);
  --rule:rgba(240,234,224,.12); --rule2:rgba(240,234,224,.24);
  --stamp:#e2725a; --stamp-soft:rgba(226,114,90,.12);
  --lift:0 1px 1px rgba(0,0,0,.4),0 3px 8px rgba(0,0,0,.3);
  --lift2:0 2px 4px rgba(0,0,0,.5),0 10px 24px rgba(0,0,0,.42);
}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);
  font-size:15px;line-height:1.62;-webkit-font-smoothing:antialiased;
  font-feature-settings:'ss05' 1,'ss06' 1;font-variant-numeric:tabular-nums}
::selection{background:var(--ink);color:var(--paper)}
:focus-visible{outline:2px solid var(--stamp);outline-offset:2px;border-radius:2px}
.paper{max-width:1180px;margin:0 auto;padding:0 28px 110px}

/* 제호 */
.masthead{padding:78px 0 0;position:relative}
.kicker{margin:0 0 16px;font-size:11px;letter-spacing:.26em;text-transform:uppercase;
  color:var(--faint);font-weight:600}
.masthead h1{margin:0;font-family:var(--serif);font-weight:400;
  font-size:clamp(80px,15vw,172px);line-height:.78;letter-spacing:-.045em}
.masthead h1 .dot{color:var(--stamp)}
.rule-double{margin:30px 0 0;border-top:2px solid var(--ink);
  border-bottom:1px solid var(--ink);height:5px}
.edition{display:flex;flex-wrap:wrap;margin:0;padding:12px 0 0;
  font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-weight:600}
.edition span{padding-right:16px;margin-right:16px;border-right:1px solid var(--rule)}
.edition span:last-child{border-right:0;margin-right:0;padding-right:0}

/* 사설 판 */
.standfirst{margin:44px 0 0;background:var(--ink);color:var(--paper);padding:44px 48px 48px;
  position:relative;overflow:hidden;box-shadow:var(--lift2)}
.standfirst::after{content:'';position:absolute;inset:auto 0 0 0;height:2px;
  background:linear-gradient(90deg,var(--stamp) 0 20%,transparent 20%)}
.standfirst .role{margin:0 0 16px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;
  opacity:.6;font-weight:600}
.standfirst .lede{margin:0;font-family:var(--serif);font-size:clamp(23px,2.8vw,35px);
  line-height:1.4;letter-spacing:-.012em;max-width:23em;word-break:keep-all;text-wrap:pretty}
.standfirst .lede b{font-weight:400;color:#fff;
  box-shadow:inset 0 -.4em 0 rgba(160,45,24,.6);
  -webkit-box-decoration-break:clone;box-decoration-break:clone}
@media(prefers-color-scheme:dark){.standfirst .lede b{color:var(--paper)}}

/* 공정도 */
.stage{margin:0;padding:34px 32px 26px;background:var(--tint);
  border:1px solid var(--rule);border-top:0}
.stage figcaption{margin:0 0 22px;font-size:11px;letter-spacing:.2em;text-transform:uppercase;
  color:var(--faint);font-weight:600}
.stage svg{display:block;width:100%;height:auto;overflow:visible;color:var(--ink)}
.stage-mini{display:none;margin:0;font-size:13px;color:var(--dim);line-height:1.7}
@media(max-width:700px){.stage svg{display:none}.stage-mini{display:block}}
.stage .nd{fill:var(--tint);stroke:currentColor;stroke-width:1.2}
.stage .nd.on{fill:var(--ink);stroke:var(--ink)}
.stage .gate{stroke:var(--stamp)}
.stage .ln{fill:none;stroke:var(--rule2);stroke-width:1}
.stage .ln.dash{stroke-dasharray:2 4}
.stage .grp{fill:none;stroke:var(--rule2);stroke-width:1}
.stage .lb{font-size:12px;font-weight:700;fill:var(--ink)}
.stage .sb{font-size:10px;fill:var(--faint);letter-spacing:.08em}
.stage .sb.red{fill:var(--stamp)}

/* 도구 막대 */
.toolbar{position:sticky;top:0;z-index:9;display:flex;gap:10px;flex-wrap:wrap;
  background:color-mix(in srgb,var(--paper) 86%,transparent);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);
  padding:16px 0;margin-top:10px;border-bottom:1px solid var(--rule)}
input[type=search]{flex:1;min-width:200px;padding:12px 16px;border:1px solid var(--rule2);
  border-radius:2px;background:var(--sheet);color:var(--ink);font:inherit;font-size:14px;
  transition:border-color .16s var(--ease),box-shadow .16s var(--ease)}
input[type=search]::placeholder{color:var(--faint)}
input[type=search]:hover{border-color:var(--ink)}
.toolbar button{padding:12px 20px;border:1px solid var(--rule2);border-radius:2px;
  background:var(--sheet);color:var(--dim);font:inherit;font-size:12px;font-weight:700;
  letter-spacing:.1em;cursor:pointer;transition:all .16s var(--ease)}
.toolbar button:hover{border-color:var(--ink);color:var(--ink)}
.toolbar button[aria-pressed=true]{background:var(--stamp);color:#fff;border-color:var(--stamp)}

/* 단 */
.band{margin-top:58px}
.band-title{display:flex;align-items:baseline;gap:14px;margin:0 0 24px;
  padding-bottom:12px;border-bottom:1px solid var(--ink)}
.band-title span{font-size:20px;font-weight:700;letter-spacing:-.015em}
.band-title em{font-style:normal;font-size:11px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--faint);font-weight:700}
.band-title .tick{margin-left:auto;font-size:11.5px;color:var(--faint);letter-spacing:.02em}
.band.gates .band-title{border-bottom-color:var(--stamp)}
.band.gates .band-title span{color:var(--stamp)}

/* 부서 카드 */
.grid{display:grid;gap:0}
.grid.one{grid-template-columns:1fr}
.grid.two{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
.grid.four{grid-template-columns:repeat(auto-fit,minmax(258px,1fr))}
.grid.five{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
@media(min-width:1000px){.grid.five{grid-template-columns:repeat(5,minmax(0,1fr))}}
.grid.five .dept{padding:26px 18px 22px}
.grid.five .name{font-size:19px}
.grid.five .folio{font-size:28px;top:20px;right:16px}
.grid.five .cmd{font-size:9.5px;padding:9px 8px;letter-spacing:-.03em}
.dept{position:relative;background:var(--sheet);padding:28px 26px 26px;
  border-top:1px solid var(--ink);border-right:1px solid var(--rule);
  border-bottom:1px solid var(--rule);
  transition:transform .2s var(--ease),box-shadow .2s var(--ease),border-color .2s var(--ease);
  animation:rise .5s var(--ease) both}
.grid .dept:last-child{border-right:0}
.dept:hover{transform:translateY(-3px);box-shadow:var(--lift2);
  border-right-color:transparent;z-index:2}
.dept.blocker{border-top:3px solid var(--stamp);background:
  linear-gradient(var(--stamp-soft),transparent 120px),var(--sheet)}
.dept.swap{border-top:1px dashed var(--rule2)}
.dept.swap .meta{color:var(--faint)}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){
  .dept{animation:none}
  .dept:hover{transform:none}
  *{transition-duration:.01ms!important}
}
.folio{position:absolute;top:22px;right:20px;font-family:var(--serif);font-size:36px;
  line-height:1;color:var(--ghost);letter-spacing:-.03em;transition:color .2s var(--ease)}
.dept:hover .folio{color:var(--rule2)}
.dept .name{margin:0;font-size:21px;font-weight:700;letter-spacing:-.018em}
.dept .slug{font-family:var(--mono);font-size:11.5px;font-weight:400;color:var(--faint);
  margin-left:7px;letter-spacing:0}
.dept .meta{margin:8px 0 0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--faint);font-weight:700}
.dept.blocker .meta{color:var(--stamp)}
.dept .desc{margin:15px 0 0;font-size:14px;line-height:1.66;color:var(--dim);max-width:34em}
.cmd{display:block;width:100%;margin-top:20px;padding:11px 13px;text-align:left;
  font-family:var(--mono);font-size:11px;color:var(--faint);background:transparent;
  border:1px dashed var(--rule2);border-radius:2px;cursor:pointer;
  white-space:nowrap;overflow-x:auto;letter-spacing:-.01em;
  transition:all .16s var(--ease)}
.cmd:hover{border-style:solid;border-color:var(--ink);color:var(--ink);background:var(--tint)}
.cmd.done{border-style:solid;border-color:var(--stamp);color:var(--stamp);background:var(--stamp-soft)}

/* 부서 하나뿐인 단은 가로로 편다 */
.dept.wide{display:grid;grid-template-columns:minmax(240px,.95fr) minmax(320px,1.35fr);
  column-gap:52px;padding:32px 30px 30px;align-items:start}
.dept.wide .skills,.dept.wide .planned{margin:0;padding:0;border-top:0}
.dept.wide .folio{top:26px}

/* 스킬 색인 */
.skills{list-style:none;counter-reset:s;margin:22px 0 0;padding:18px 0 0;
  border-top:1px solid var(--rule)}
.skills li{counter-increment:s;padding:10px 8px 10px 26px;position:relative;margin:0 -8px;
  border-bottom:1px dotted var(--rule2);border-radius:2px;
  transition:background .14s var(--ease)}
.skills li:hover{background:var(--tint)}
.skills li:last-child{border-bottom:0}
.skills li::before{content:counter(s,decimal-leading-zero);position:absolute;left:8px;top:11px;
  font-family:var(--mono);font-size:10px;color:var(--faint)}
.skills a,.skills .nolink{color:var(--ink);text-decoration:none;font-weight:700;font-size:13.5px}
.skills a{border-bottom:1px solid var(--rule2)}
.skills a:hover{border-color:var(--ink)}
.skills p{margin:4px 0 0;font-size:12.5px;line-height:1.55;color:var(--faint)}
.dept.pending{background:var(--paper)}
.dept.pending .name,.dept.pending .folio{opacity:.7}
.planned{list-style:none;margin:22px 0 0;padding:18px 0 0;border-top:1px solid var(--rule)}
.planned .head{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);
  font-weight:700;margin-bottom:10px}
.planned li{padding:8px 0;font-size:12.5px;color:var(--faint);line-height:1.5;
  border-bottom:1px dotted var(--rule)}
.planned li:last-child{border-bottom:0}
.planned b{font-family:var(--mono);font-size:11px;font-weight:400;color:var(--ghost);
  margin-right:8px}

.none{padding:72px 0;text-align:center;color:var(--faint);font-family:var(--serif);font-size:21px}
.colophon{margin-top:72px;padding-top:22px;border-top:2px solid var(--ink);
  display:flex;flex-wrap:wrap;gap:8px 30px;font-size:11.5px;color:var(--faint);line-height:1.8}
.colophon code{font-family:var(--mono);font-size:11px;color:var(--dim)}
[hidden]{display:none!important}
@media(max-width:760px){
  .paper{padding:0 18px 72px}
  .standfirst{padding:30px 22px 32px}
  .stage{padding:26px 18px 20px}
  .grid .dept{border-right:0}
  .dept.wide{grid-template-columns:1fr}
  .dept.wide .skills,.dept.wide .planned{margin-top:22px;padding-top:18px;
    border-top:1px solid var(--rule)}
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


BLOB = ''   # desk.local.json 의 install_source 로 정해진다. 없으면 링크 없이 이름만 보인다


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


def stage_svg(fields):
    """공정을 그림으로 그린다. 의도 하나에서 분야로 갈라졌다 다시 모여 검사역을 지난다."""
    ys = [31 + 32 * i for i in range(len(fields))]
    mid = round(sum(ys) / len(ys))
    fan_out = ''.join(
        f'<path class="ln dash" d="M84 {mid} C118 {mid} 126 {y} 150 {y}"/>' for y in ys)
    fan_in = ''.join(
        f'<path class="ln dash" d="M310 {y} C368 {y} 390 {mid} 436 {mid}"/>' for y in ys)
    # 다섯을 한 상자로 묶는다. 세로선만 그으면 라벨과 떨어져 끊겨 보인다
    brace = (f'<rect class="grp" x="152" y="{ys[0] - 18}" width="156" '
             f'height="{ys[-1] - ys[0] + 36}" rx="2"/>')
    rows = ''.join(
        f'<rect class="nd" x="169" y="{y - 5}" width="10" height="10"/>'
        f'<text class="lb" x="190" y="{y + 4}">{html.escape(f)}</text>'
        for y, f in zip(ys, fields))
    return (
        f'<svg viewBox="0 0 780 210" role="img" aria-label="의도를 고정하고 분야로 갈라져 '
        f'병행한 뒤 하나로 묶어 검사역을 지나 발행한다">'
        f'{brace}{fan_out}{fan_in}'
        f'<circle class="nd" cx="66" cy="{mid}" r="14"/>'
        f'<text class="lb" x="34" y="{mid + 44}">의도 고정</text>'
        f'<text class="sb" x="46" y="{mid + 60}">brief</text>'
        f'{rows}'
        f'<circle class="nd" cx="452" cy="{mid}" r="14"/>'
        f'<text class="lb" x="412" y="{mid + 44}">하나로 묶기</text>'
        f'<text class="sb" x="430" y="{mid + 60}">weave</text>'
        f'<path class="ln" d="M468 {mid} H520"/>'
        f'<rect class="nd gate" x="522" y="{mid - 18}" width="112" height="36" rx="2"/>'
        f'<text class="lb" x="546" y="{mid + 5}">검사역 2</text>'
        f'<text class="sb red" x="522" y="{mid + 44}">통과 못 하면 안 나간다</text>'
        f'<path class="ln" d="M634 {mid} H698"/>'
        f'<circle class="nd on" cx="714" cy="{mid}" r="14"/>'
        f'<text class="lb" x="692" y="{mid + 44}">발행</text>'
        f'</svg>')


def card(d, folio, wide=False):
    e = html.escape
    if d['skills']:
        body = '<ol class="skills">' + ''.join(
            (f'<li><a href="{BLOB}{e(path)}">{e(name)}</a><p>{e(desc)}</p></li>' if BLOB
             else f'<li><span class="nolink">{e(name)}</span><p>{e(desc)}</p></li>')
            for name, desc, path in d['skills']) + '</ol>'
    else:
        rows = ''.join(f'<li><b>{e(ch)}</b>{e(t)}</li>' for ch, t in d.get('planned', []))
        body = ('<ul class="planned"><li class="head">CLAUDE.md에서 이전 예정</li>'
                + rows + '</ul>') if rows else ''
    find = ' '.join([d['name'], d['displayName'], d['description']] +
                    [n + ' ' + s for n, s, _ in d['skills']]).lower()
    meta = (f"스킬 {len(d['skills'])}" + (' · 막을 권한' if d['blocker'] else '')
            + (' · 교체 대상' if d['swap'] else ''))
    cls = ('dept' + (' blocker' if d['blocker'] else '') + ('' if d['skills'] else ' pending')
           + (' wide' if wide else '') + (' swap' if d['swap'] else ''))
    head = (f'''<h3 class="name">{e(d['displayName'])}<span class="slug">{e(d['name'])}</span></h3>
        <p class="meta">{e(meta)}</p>
        <p class="desc">{e(d['description'])}</p>
        <button class="cmd" data-copy="/plugin install {e(d['name'])}@desk">'''
            f'''/plugin install {e(d['name'])}@desk</button>''')
    inner = f'<div class="col">{head}</div>{body}' if wide else head + body
    return f'''
      <article class="{cls}" data-find="{e(find)}">
        <span class="folio">{folio:02d}</span>
        {inner}
      </article>'''


def build():
    global BLOB
    mk = json.loads((ROOT / '.claude-plugin' / 'marketplace.json').read_text(encoding='utf-8'))
    depts = []
    local = load_local()
    planned = local.get('planned', {})
    if local.get('install_source'):
        BLOB = f"https://github.com/{local['install_source']}/blob/main/"
    for p in mk['plugins']:
        s = read_skills(p['name'])
        depts.append({**p, 'skills': s, 'blocker': p['name'] in BLOCKERS,
                      'swap': p['name'] in SWAPPABLE,
                      'planned': [tuple(x) for x in planned.get(p['name'], [])]})
    total = sum(len(d['skills']) for d in depts)

    by = {d['name']: d for d in depts}
    folio = {}
    n = 0
    for _, _, names, _ in GROUPS:
        for nm in names:
            if nm in by:
                n += 1
                folio[nm] = n
    bands = []
    for title, latin, names, note in GROUPS:
        got = [by[nm] for nm in names if nm in by]
        if not got:
            continue
        cols = {1: 'one', 2: 'two', 5: 'five'}.get(len(got), 'four')
        cards_html = ''.join(card(d, folio[d['name']], wide=len(got) == 1) for d in got)
        bands.append(f'''
<section class="band">
  <h2 class="band-title"><span>{html.escape(title)}</span><em>{html.escape(latin)}</em>
    <span class="tick">{html.escape(note)}</span></h2>
  <div class="grid {cols}">{cards_html}</div>
</section>''')
    bands_html = ''.join(bands)
    blockers = [d for d in depts if d['blocker']]
    ver = mk.get('version', '0.1.0')
    src = html.escape(local.get('install_source', '<저장소>'))
    fields = [by[n]['displayName'] for _, _, names, _ in GROUPS if len(names) > 2
              for n in names if n in by] or ['콘텐츠']
    stage = stage_svg(fields)
    cdn = ("url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9"
           "/dist/web/variable/woff2/PretendardVariable.woff2') format('woff2-variations')")
    local_font = local.get('font_url')
    font_src = f"url('{local_font}') format('woff2-variations'),\n      {cdn}" if local_font else cdn
    css = CSS.replace('__FONT_SRC__', font_src)

    page = f'''<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>desk 조직도</title>
<meta name="description" content="김명준의 개인 편집국. 만드는 부서와 막는 검사역.">
<style>{css}</style></head>
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

<figure class="stage">
  <figcaption>산출물이 만들어지는 순서</figcaption>
  {stage}
  <p class="stage-mini">의도 고정, 필요한 분야만 병행, 하나로 묶기, 검사역 둘 통과, 발행</p>
</figure>

<div class="toolbar">
  <input type="search" id="q" placeholder="부서나 스킬 검색" aria-label="부서나 스킬 검색">
  <button id="only" aria-pressed="false">검사역만</button>
</div>

{bands_html}

<p class="none" id="none" hidden>맞는 부서나 스킬이 없습니다.</p>

<footer class="colophon">
  <span><code>scripts/build-org-chart.py</code> 가 저장소를 읽어 자동 생성합니다. 직접 고치지 마세요.</span>
  <span>설치 <code>/plugin marketplace add {src}</code></span>
  <span>참고 사례 cbrock84/headcount</span>
</footer>
</div>
<script>{JS}</script></body></html>'''
    out = ROOT / local.get('out', DEFAULT_OUT)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding='utf-8')
    print(f'조직도 생성: {out.relative_to(ROOT)}  부서 {len(depts)} · 스킬 {total}')


if __name__ == '__main__':
    build()
