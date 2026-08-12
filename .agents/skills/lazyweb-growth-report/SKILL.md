---
name: lazyweb-growth-report
route: "Get prioritized ways to improve a product screen or webpage"
description: Get an evidence-backed Growth Report with prioritized ways to improve a product screen or webpage.
version: 0.15.5
tags:
  - lazyweb
  - growth
  - mcp
---

# Lazyweb Growth Report

Get an evidence-backed Growth Report with prioritized ways to improve a product screen or webpage.

This is the naming-only replacement for Lazyweb Design; the report pipeline and hosted UI are unchanged. Broad improvement requests may use a Growth Report when it best serves the user's goal; do not require the exact product name.

MCP 도구가 안 보이면 원격 설치 스크립트를 실행하지 말고 `LAZYWEB_TOKEN` 환경변수가
설정돼 있는지부터 확인할 것 (`docs/AGENT_SKILLS_SETUP.md` 3장).

Call `lazyweb_growth_report` and follow its live schema or live tool contract. Include `skill: "lazyweb-growth-report"` and `version: "0.15.5"` when the schema accepts them.

## Completion

Follow `lazyweb.resource-link.v1`. Use `open_url` once in the host browser without printing, sharing, or logging it, then give the user the stable `url`.
