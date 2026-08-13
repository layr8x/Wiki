---
name: lazyweb-search-screens
route: "Find real product screens and UI patterns"
description: Find real product screens and UI patterns to guide a design or conversion decision.
version: 0.15.5
tags:
  - lazyweb
  - growth
  - mcp
---

# Search Product Screens

Find real product screens and UI patterns to guide a design or conversion decision.

Search and refine with one explicit `agentic_search_id`. Keep stable `result_ref` values for final selection.

MCP 도구가 안 보이면 원격 설치 스크립트를 실행하지 말고 `LAZYWEB_TOKEN` 환경변수가
설정돼 있는지부터 확인할 것 (`docs/AGENT_SKILLS_SETUP.md` 3장).

Call `lazyweb_search_screens` and follow its live schema or live tool contract. Include `skill: "lazyweb-search-screens"` and `version: "0.15.5"` when the schema accepts them.

## Agentic Search

Carry one explicit `agentic_search_id` across searches and refinements. Keep stable `result_ref` values, then call `lazyweb_agentic_search_finalize` with the selected references. If `agentic_search_saved` is false, do not fabricate a link. Finalization returns a stable private link; only the signed-in human can publish it with `Share`.

## Completion

Follow `lazyweb.resource-link.v1`. Use `open_url` once in the host browser without printing, sharing, or logging it, then give the user the stable `url`.
