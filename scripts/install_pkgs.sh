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

exit 0
