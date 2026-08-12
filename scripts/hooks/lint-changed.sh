#!/bin/bash
# PostToolUse hook — 코드 파일을 고칠 때마다 그 파일만 ESLint로 검사한다.
# 목적: CI에서 뒤늦게 lint 실패로 되돌아오는 일을 편집 시점에 막는다.
# 입력: stdin으로 hook JSON. 출력: 오류 시 exit 2 + stderr(= Claude에게 전달됨).

input=$(cat)
file=$(printf '%s' "$input" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path",""))' 2>/dev/null)

# 검사 대상이 아니면 조용히 통과
case "$file" in
  *.js|*.jsx) ;;
  *) exit 0 ;;
esac

# 저장소 밖 파일, 검사 제외 폴더는 통과
case "$file" in
  */.agents/*|*/node_modules/*|*/dist/*) exit 0 ;;
esac

[ -f "$file" ] || exit 0

out=$(npx --no-install eslint "$file" 2>&1)
if [ $? -ne 0 ]; then
  echo "ESLint 오류 — 이 파일을 고친 뒤 계속할 것:" >&2
  echo "$out" >&2
  exit 2
fi
exit 0
