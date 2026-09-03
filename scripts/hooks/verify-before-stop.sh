#!/bin/bash
# Stop hook — 작업을 끝내기 전에 실제로 검사를 돌린다.
# 목적: CLAUDE.md의 "검증 전 완료 보고 금지"를 글이 아니라 자동 실행으로 강제한다.
#   코드가 바뀌었으면 lint와 build.
#   문서(.md)가 바뀌었으면 말 검사역(안 풀어쓴 용어 + 번역투).
# 무한 반복 방지: stop_hook_active가 true면(이미 한 번 막았으면) 통과시킨다.

input=$(cat)
active=$(printf '%s' "$input" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("stop_hook_active",False))' 2>/dev/null)
[ "$active" = "True" ] && exit 0

fail=""
msg=""

# 1. 문서 검사 — 바뀐 마크다운이 있으면 말 검사역을 돌린다
if [ -f scripts/hooks/check-writing.py ]; then
  if ! writing=$(python3 scripts/hooks/check-writing.py 2>&1); then
    fail="문서"
    msg="$writing"
  fi
fi

# 2. 코드 검사 — 소스가 바뀌지 않았으면 건너뛴다
changed=$(git diff --name-only HEAD -- '*.js' '*.jsx' 2>/dev/null | grep -v '^\.agents/' | head -1)
if [ -z "$fail" ] && [ -n "$changed" ]; then
  npm run lint >/tmp/hook-lint.log 2>&1 || fail="lint"
  [ -z "$fail" ] && { npm run build >/tmp/hook-build.log 2>&1 || fail="build"; }
  [ -n "$fail" ] && msg=$(tail -30 "/tmp/hook-$fail.log")
fi

if [ -n "$fail" ]; then
  echo "검증 실패($fail) — 완료 보고 전에 고칠 것:" >&2
  echo "$msg" >&2
  exit 2
fi
exit 0
