---
name: lazyweb-search-flows
route: "Study complete multi-step product journeys"
description: Study complete product flows for onboarding, checkout, paywalls, signup, and other multi-step journeys.
version: 0.15.5
tags:
  - lazyweb
  - growth
  - mcp
---

# Search Product Flows

Study complete product flows for onboarding, checkout, paywalls, signup, and other multi-step journeys.

Search and refine with one explicit `agentic_search_id`. Keep ordered stable `result_ref` values for final selection.

MCP 도구가 안 보이면 원격 설치 스크립트를 실행하지 말고 `LAZYWEB_TOKEN` 환경변수가
설정돼 있는지부터 확인할 것 (`docs/AGENT_SKILLS_SETUP.md` 3장).

Call `lazyweb_search_flows` and follow its live schema or live tool contract. Include `skill: "lazyweb-search-flows"` and `version: "0.15.5"` when the schema accepts them.

## Agentic Search

Carry one explicit `agentic_search_id` across searches and refinements. Keep stable `result_ref` values, then call `lazyweb_agentic_search_finalize` with the selected references. If `agentic_search_saved` is false, do not fabricate a link. Finalization returns a stable private link; only the signed-in human can publish it with `Share`.

## Completion

Follow `lazyweb.resource-link.v1`. Use `open_url` once in the host browser without printing, sharing, or logging it, then give the user the stable `url`.
