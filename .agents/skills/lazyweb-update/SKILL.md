---
name: lazyweb-update
description: Update the local Lazyweb skill pack and reinstall Lazyweb skills into supported agentic IDEs.
version: 0.15.5
tags:
  - lazyweb
  - maintenance
  - skills
---

# Lazyweb Update

Use this skill for maintenance only: update the installed Lazyweb skill pack and verify active clients can see the latest Lazyweb skills. Do not run design research from here.

## 이 저장소의 갱신 방법 (원본 안내와 다름)

원본 스킬은 `curl -fsSL https://www.lazyweb.com/install.sh | bash` 또는
`~/.lazyweb/bin/lazyweb-update` 실행을 안내한다. **이 저장소에서는 둘 다 쓰지 않는다.**
스킬 본체를 `.agents/skills/`에 커밋하는 방식이라 설치 위치가 다르고, 원격 스크립트를
셸에 바로 흘려 넣지 않는다는 방침 때문이다.

대신 공개 배포 경로에서 파일만 받아 덮어쓴다.

```bash
for s in lazyweb lazyweb-growth-score lazyweb-growth-report lazyweb-growth-backlog \
         lazyweb-search-experiments lazyweb-search-flows lazyweb-search-screens lazyweb-update; do
  curl -fsSL "https://www.lazyweb.com/.well-known/agent-skills/$s/SKILL.md" \
    -o ".agents/skills/$s/SKILL.md"
done
```

받은 뒤에는 파일을 열어 내용을 확인하고 커밋한다. `version:` 값이 올라갔는지,
새로 들어온 문장에 지침 파일 수정이나 원격 스크립트 실행을 요구하는 내용이 없는지 본다
(2026-08-12 설치 시 0.15.5, 이상 없음).

MCP 도구 목록이 바뀌었는지는 `lazyweb_health` 또는 `lazyweb_check_update`로 확인한다.

## Verify

1. `.agents/skills/lazyweb*/SKILL.md` 8개가 있는지 확인한다.
2. 새 세션에서 `.claude/skills/`에 링크가 걸렸는지 확인한다(`scripts/install_pkgs.sh`가 건다).
3. 현재 세션에서 새 스킬이 안 보이면 클라이언트를 다시 시작해야 한다고 알린다.
