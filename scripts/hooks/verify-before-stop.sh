#!/bin/bash
# Stop hook — 작업을 끝내기 전에 lint와 build를 실제로 돌려 검증한다.
# 목적: CLAUDE.md의 "검증 전 완료 보고 금지"를 글이 아니라 자동 실행으로 강제한다.
# 무한 반복 방지: stop_hook_active가 true면(이미 한 번 막았으면) 통과시킨다.

input=$(cat)
active=$(printf '%s' "$input" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("stop_hook_active",False))' 2>/dev/null)
[ "$active" = "True" ] && exit 0

# 소스가 바뀌지 않았으면 검사할 이유가 없다 (문서만 고친 경우 등)
changed=$(git diff --name-only HEAD -- '*.js' '*.jsx' 2>/dev/null | grep -v '^\.agents/' | head -1)
[ -z "$changed" ] && exit 0

fail=""
npm run lint >/tmp/hook-lint.log 2>&1 || fail="lint"
[ -z "$fail" ] && { npm run build >/tmp/hook-build.log 2>&1 || fail="build"; }

if [ -n "$fail" ]; then
  echo "검증 실패($fail) — 완료 보고 전에 고칠 것:" >&2
  tail -30 "/tmp/hook-$fail.log" >&2
  exit 2
fi
exit 0
