#!/usr/bin/env python3
"""조직도 한 장을 만든다.

저장소를 훑어 docs/org-chart.html 을 다시 쓴다. 손으로 고치지 않는다.
읽는 곳: .claude-plugin/marketplace.json (부서 목록) / plugins/*/skills/*/SKILL.md (스킬 이름과 설명)

사용: python3 scripts/build-org-chart.py
"""
import json, re, html
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'org-chart.html'
BLOCKERS = {'plain', 'verify'}          # 막을 권한이 있는 부서
GLYPH = {'persuade': '文', 'numbers': '数', 'screens': '面',
         'plain': '語', 'verify': '検', 'keepalive': '維'}


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
        # 첫 문장까지만. 카드가 길어지면 훑기가 안 된다
        short = re.split(r'(?<=다)\.\s', desc)[0].rstrip('.') + '.'
        out.append((md.parent.name, short[:110] + ('…' if len(short) > 110 else ''),
                    str(md.relative_to(ROOT))))
    return out


def build():
    mk = json.loads((ROOT / '.claude-plugin' / 'marketplace.json').read_text(encoding='utf-8'))
    depts, total = [], 0
    for p in mk['plugins']:
        skills = read_skills(p['name'])
        total += len(skills)
        depts.append({**p, 'skills': skills, 'blocker': p['name'] in BLOCKERS})

    cards = []
    for d in depts:
        rows = ''.join(
            f'<li><a href="../{html.escape(path)}"><b>{html.escape(name)}</b></a>'
            f'<span>{html.escape(desc)}</span></li>'
            for name, desc, path in d['skills']
        ) or '<li class="empty"><b>준비 중</b><span>아직 옮기지 않은 부서입니다.</span></li>'
        cards.append(f'''
    <article class="dept{' blocker' if d['blocker'] else ''}"
             data-find="{html.escape((d['name'] + ' ' + d['displayName'] + ' ' + d['description'] + ' ' + ' '.join(n + ' ' + s for n, s, _ in d['skills'])).lower())}">
      <header>
        <span class="glyph">{GLYPH.get(d['name'], '·')}</span>
        <div>
          <h2>{html.escape(d['displayName'])} <small>{html.escape(d['name'])}</small></h2>
          <p class="count">스킬 {len(d['skills'])}개{' · 막을 권한 있음' if d['blocker'] else ''}</p>
        </div>
      </header>
      <p class="desc">{html.escape(d['description'])}</p>
      <button class="cmd" data-copy="/plugin install {d['name']}@desk">/plugin install {d['name']}@desk</button>
      <ul class="skills">{rows}</ul>
    </article>''')

    page = f'''<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>desk 조직도</title>
<style>
:root{{--bg:#fff;--fg:#161616;--dim:rgba(22,22,22,.72);--faint:rgba(22,22,22,.48);
--line:rgba(22,22,22,.08);--line2:rgba(22,22,22,.24);--card:#fff;--mark:#0043ce;--warn:#8a3800}}
@media(prefers-color-scheme:dark){{:root{{--bg:#0f0f0f;--fg:#f4f4f4;--dim:rgba(244,244,244,.72);
--faint:rgba(244,244,244,.48);--line:rgba(244,244,244,.10);--line2:rgba(244,244,244,.24);
--card:#171717;--mark:#78a9ff;--warn:#ffb784}}}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--fg);
font-family:Pretendard,-apple-system,'Segoe UI',system-ui,sans-serif;line-height:1.6;
-webkit-font-smoothing:antialiased}}
.wrap{{max-width:1180px;margin:0 auto;padding:56px 24px 80px}}
h1{{font-size:32px;font-weight:200;letter-spacing:-.01em;margin:0 0 4px}}
.sub{{color:var(--dim);margin:0 0 28px;font-size:15px}}
.stats{{display:flex;gap:28px;padding:16px 0;border-top:1px solid var(--line);
border-bottom:1px solid var(--line);margin-bottom:24px;flex-wrap:wrap}}
.stats b{{font-size:26px;font-weight:600;display:block;line-height:1.2}}
.stats span{{font-size:13px;color:var(--faint)}}
.tools{{position:sticky;top:0;background:var(--bg);padding:14px 0;z-index:5;
display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--line)}}
input[type=search]{{flex:1;min-width:220px;padding:10px 14px;border:1px solid var(--line2);
border-radius:2px;background:var(--card);color:var(--fg);font:inherit;font-size:14px}}
button{{padding:10px 14px;border:1px solid var(--line2);border-radius:2px;background:var(--card);
color:var(--fg);font:inherit;font-size:13px;cursor:pointer}}
button[aria-pressed=true]{{background:var(--fg);color:var(--bg);border-color:var(--fg)}}
.chief{{border:1px solid var(--line2);border-radius:2px;padding:18px 20px;margin:24px 0 8px;
background:var(--card)}}
.chief h2{{margin:0;font-size:17px;font-weight:600}}
.chief p{{margin:6px 0 0;color:var(--dim);font-size:14px}}
.grid{{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));margin-top:16px}}
.dept{{border:1px solid var(--line);border-radius:2px;background:var(--card);padding:18px}}
.dept.blocker{{border-color:var(--warn)}}
.dept header{{display:flex;gap:12px;align-items:flex-start}}
.glyph{{width:34px;height:34px;flex:none;display:grid;place-items:center;border:1px solid var(--line2);
border-radius:2px;font-size:15px}}
.dept h2{{margin:0;font-size:17px;font-weight:600}}
.dept h2 small{{font-weight:400;color:var(--faint);font-size:12px;margin-left:6px}}
.count{{margin:2px 0 0;font-size:12px;color:var(--faint)}}
.dept.blocker .count{{color:var(--warn)}}
.desc{{margin:12px 0;font-size:14px;color:var(--dim)}}
.cmd{{width:100%;text-align:left;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;
color:var(--dim)}}
.cmd.done{{border-color:var(--mark);color:var(--mark)}}
.skills{{list-style:none;margin:14px 0 0;padding:14px 0 0;border-top:1px solid var(--line)}}
.skills li{{padding:7px 0;font-size:13px;border-bottom:1px solid var(--line)}}
.skills li:last-child{{border-bottom:0}}
.skills a{{color:var(--fg);text-decoration:none;border-bottom:1px solid var(--line2)}}
.skills span{{display:block;color:var(--faint);font-size:12.5px;margin-top:2px}}
.skills .empty b{{color:var(--faint);font-weight:400}}
.none{{padding:40px 0;color:var(--faint);text-align:center}}
footer{{margin-top:48px;padding-top:20px;border-top:1px solid var(--line);
font-size:12.5px;color:var(--faint)}}
[hidden]{{display:none!important}}
</style></head><body><div class="wrap">
<h1>desk</h1>
<p class="sub">김명준의 편집국. 만드는 부서 넷과 막는 검사역 둘.</p>
<div class="stats">
  <div><b>{len(depts)}</b><span>부서</span></div>
  <div><b>{total}</b><span>스킬</span></div>
  <div><b>{sum(1 for d in depts if d['blocker'])}</b><span>막을 권한 있는 부서</span></div>
</div>
<div class="tools">
  <input type="search" id="q" placeholder="부서나 스킬 검색">
  <button id="only" aria-pressed="false">검사역만</button>
</div>
<div class="chief">
  <h2>김명준 · 플랫폼 UX 디자이너 겸 PO</h2>
  <p>산출물의 목적은 정보 전달이 아니라 결정을 받아내는 것. 검사역 둘이 통과시켜야 밖으로 나갑니다.</p>
</div>
<div class="grid" id="grid">{''.join(cards)}</div>
<p class="none" id="none" hidden>맞는 부서나 스킬이 없습니다.</p>
<footer>
  scripts/build-org-chart.py 가 저장소를 읽어 자동 생성합니다. 이 파일을 직접 고치지 마세요.<br>
  설치: <code>/plugin marketplace add layr8x/Wiki</code> 뒤에 부서별 설치 명령을 씁니다.
</footer>
</div>
<script>
const q=document.getElementById('q'),only=document.getElementById('only'),
      none=document.getElementById('none'),
      cards=[...document.querySelectorAll('.dept')];
function apply(){{
  const t=q.value.trim().toLowerCase(), b=only.getAttribute('aria-pressed')==='true';
  let n=0;
  cards.forEach(c=>{{
    const ok=(!t||c.dataset.find.includes(t))&&(!b||c.classList.contains('blocker'));
    c.hidden=!ok; if(ok)n++;
  }});
  none.hidden=n>0;
}}
q.addEventListener('input',apply);
only.addEventListener('click',()=>{{only.setAttribute('aria-pressed',only.getAttribute('aria-pressed')!=='true');apply();}});
document.querySelectorAll('.cmd').forEach(b=>b.addEventListener('click',()=>{{
  navigator.clipboard?.writeText(b.dataset.copy);
  const o=b.textContent; b.textContent='복사됨'; b.classList.add('done');
  setTimeout(()=>{{b.textContent=o;b.classList.remove('done');}},1200);
}}));
</script></body></html>'''
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(page, encoding='utf-8')
    print(f'조직도 생성: {OUT.relative_to(ROOT)}  부서 {len(depts)} · 스킬 {total}')


if __name__ == '__main__':
    build()
