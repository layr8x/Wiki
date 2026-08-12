#!/bin/bash
# 클라우드 세션(claude.ai/code)에서만 의존성 자동 설치.
# 로컬 세션에서는 CLAUDE_CODE_REMOTE가 없으므로 아무것도 하지 않음.

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

# 이미 설치돼 있으면 건너뛰어 세션 시작 지연 최소화
if [ ! -d node_modules ]; then
  npm install || true
fi

# 에이전트 스킬 연결 복원.
# 스킬 본체(.agents/skills)는 저장소에 커밋돼 있지만 .claude/는 git 무시라
# 새 클론에서는 Claude Code가 읽는 .claude/skills 링크가 비어 있다. 여기서 다시 건다.
if [ -d .agents/skills ]; then
  mkdir -p .claude/skills
  for skill in .agents/skills/*/; do
    name=$(basename "$skill")
    [ -e ".claude/skills/$name" ] || ln -s "../../.agents/skills/$name" ".claude/skills/$name" 2>/dev/null || true
  done
fi

exit 0
