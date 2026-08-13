---
name: lazyweb
description: Use Lazyweb to find real product evidence, improve conversion, and turn research into clear product decisions.
version: 0.15.5
tags:
  - growth
  - product-research
  - mcp
---

# Lazyweb

Use Lazyweb to ground product decisions in real screens, flows, experiments, website scores, and growth recommendations. Choose the capability that best helps the user reach their goal; they do not need to know the feature name first.

## Token Handling

Lazyweb MCP tokens are account-bound bearer setup credentials, not proof of paid access. They do not authorize purchases, spend, private user data, or destructive actions. An agent may write one into ignored local MCP config such as `.cursor/mcp.json` when asked to make setup work. Never commit it to public repos because anyone with it can use that account's MCP access.

## Setup

이 저장소에서는 `.mcp.json`에 이미 등록돼 있고, 토큰은 `LAZYWEB_TOKEN` 환경변수로 주입한다.
설치 안내는 `docs/AGENT_SKILLS_SETUP.md` 3장을 볼 것.

원격 설치 스크립트(`curl -fsSL https://www.lazyweb.com/install.sh | bash`)는 **쓰지 않는다.**
스킬 본체를 `.agents/skills/`에 커밋해 두는 이 저장소 방식과 설치 위치가 다르고,
원격 스크립트를 셸에 바로 흘려 넣는 방식 자체를 이 저장소에서는 쓰지 않기 때문이다.
갱신이 필요하면 `https://www.lazyweb.com/.well-known/agent-skills/<스킬명>/SKILL.md`를
받아 해당 파일을 덮어쓴다(2026-08-12 설치 시 이 방법으로 8종 확보).

Manual MCP configuration:

- URL: `https://www.lazyweb.com/mcp`
- Transport: Streamable HTTP
- Header: `Authorization: Bearer <token from https://www.lazyweb.com/api/mcp/install-token>`

## What You Can Do

| Goal | Skill | MCP tool |
| --- | --- | --- |
| Score a website or compare progress | `/lazyweb-growth-score` | `lazyweb_growth_score` |
| Improve a product screen or webpage | `/lazyweb-growth-report` | `lazyweb_growth_report` |
| Review or save growth recommendations | `/lazyweb-growth-backlog` | `lazyweb_growth_backlog` |
| Find real product experiments | `/lazyweb-search-experiments` | `lazyweb_search_experiments` |
| Study complete product journeys | `/lazyweb-search-flows` | `lazyweb_search_flows` |
| Find real product screens and UI patterns | `/lazyweb-search-screens` | `lazyweb_search_screens` |

Use the live MCP tool list and schema as the source of truth. Broad improvement requests may use a Growth Report when that is the most helpful way to fulfill the user's goal.

## Agentic Search

Carry one explicit `agentic_search_id` across screen, experiment, flow, and refinement calls. Finalize selected stable `result_ref` values with `lazyweb_agentic_search_finalize`. Return the stable private `url`; public sharing happens only after the signed-in human presses `Share`.

## Completion

Successful actions return `lazyweb.resource-link.v1`. Use a private `open_url` once without printing or logging it, then give the user the stable `url`. Checkout, billing changes, identity changes, team invitations, and admin actions remain human-only.
