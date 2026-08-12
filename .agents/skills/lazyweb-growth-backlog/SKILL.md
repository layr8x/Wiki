---
name: lazyweb-growth-backlog
route: "Review growth recommendations or save an improvement idea"
description: See your growth recommendations or add a product improvement idea to the Backlog.
version: 0.15.5
tags:
  - lazyweb
  - growth
  - mcp
---

# Lazyweb Growth Backlog

See your growth recommendations or add a product improvement idea to the Backlog.

Use `list` to review Backlog items and `add` to save an owner- and product-scoped improvement idea. Follow the live schema for evidence references and idempotency.

MCP 도구가 안 보이면 원격 설치 스크립트를 실행하지 말고 `LAZYWEB_TOKEN` 환경변수가
설정돼 있는지부터 확인할 것 (`docs/AGENT_SKILLS_SETUP.md` 3장).

Call `lazyweb_growth_backlog` and follow its live schema or live tool contract. Include `skill: "lazyweb-growth-backlog"` and `version: "0.15.5"` when the schema accepts them.

## Completion

Follow `lazyweb.resource-link.v1`. Use `open_url` once in the host browser without printing, sharing, or logging it, then give the user the stable `url`.
