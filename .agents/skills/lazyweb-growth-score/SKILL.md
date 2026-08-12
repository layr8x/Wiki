---
name: lazyweb-growth-score
route: "Score a website or compare its progress"
description: Score a website's growth readiness, create a new score, or compare progress over time.
version: 0.15.5
tags:
  - lazyweb
  - growth
  - mcp
---

# Lazyweb Growth Score

Score a website's growth readiness, create a new score, or compare progress over time.

Use `get` for existing results, `generate` only when creating a score, and `changes` for comparisons. Reads and comparisons must not trigger regrading.

MCP 도구가 안 보이면 원격 설치 스크립트를 실행하지 말고 `LAZYWEB_TOKEN` 환경변수가
설정돼 있는지부터 확인할 것 (`docs/AGENT_SKILLS_SETUP.md` 3장).

Call `lazyweb_growth_score` and follow its live schema or live tool contract. Include `skill: "lazyweb-growth-score"` and `version: "0.15.5"` when the schema accepts them.

## Completion

Follow `lazyweb.resource-link.v1`. Use `open_url` once in the host browser without printing, sharing, or logging it, then give the user the stable `url`.
