#!/usr/bin/env bash
# scripts/install-launchd.sh
#
# 이 기기에 상시 실행 예약(launchd)을 설치한다. **기기를 바꿀 때마다 한 번씩 실행할 것.**
#
# 왜 필요한가
#   예약 파일은 ~/Library/LaunchAgents 에 저장되는데, 그 폴더는 iCloud 로 동기화되지 않는다.
#   소스코드 폴더는 iCloud 에 있어 새 기기에서도 바로 보이지만, "5분마다 실행해라"는 예약
#   자체는 따라오지 않는다. 2026-08-13 에 맥 스튜디오 → 맥북 에어로 옮기면서 이걸 놓쳐
#   수집이 5시간 넘게 멈췄다.
#
# 하는 일
#   1) node 실제 경로를 찾아 plist 에 박아 넣는다(애플 실리콘은 /opt/homebrew/bin/node 라
#      /usr/local/bin/node 로 적힌 원본을 그대로 쓰면 조용히 실패한다).
#   2) WorkingDirectory 를 지금 이 저장소 경로로 바꾼다.
#   3) ~/Library/LaunchAgents 에 복사하고 불러온다(이미 있으면 먼저 내린다).
#
# 실행:
#   bash scripts/install-launchd.sh            # 카카오 수집 + 쿠키 갱신 (기본)
#   bash scripts/install-launchd.sh --all      # 잔디 토큰·시트 동기화까지 전부
#   bash scripts/install-launchd.sh --list     # 지금 이 기기에 뭐가 걸려 있는지만 보기
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
LOGDIR="$HOME/Library/Logs/ams-wiki"

DEFAULT_JOBS=(com.amswiki.kakao-collect com.amswiki.kakao-cookie-refresh)
ALL_JOBS=("${DEFAULT_JOBS[@]}" com.amswiki.jandi-token-refresh com.amswiki.kakao-sheets-sync)

if [[ "${1:-}" == "--list" ]]; then
  echo "이 기기에 걸린 ams-wiki 예약:"
  launchctl list | grep -i amswiki || echo "  (없음)"
  exit 0
fi

JOBS=("${DEFAULT_JOBS[@]}")
[[ "${1:-}" == "--all" ]] && JOBS=("${ALL_JOBS[@]}")

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "node 를 찾을 수 없습니다. Node.js 를 먼저 설치하세요 (brew install node)." >&2
  exit 1
fi

if [[ ! -f "$REPO/.env.local" ]]; then
  echo "경고: $REPO/.env.local 이 없습니다. 예약은 설치되지만 실행하면 바로 실패합니다." >&2
  echo "      (iCloud 에서 아직 안 내려왔을 수 있습니다 — Finder 로 폴더를 한 번 열어 보세요.)" >&2
fi

mkdir -p "$AGENTS" "$LOGDIR"
echo "저장소:  $REPO"
echo "node:    $NODE_BIN"
echo

for job in "${JOBS[@]}"; do
  src="$REPO/scripts/launchd/$job.plist"
  dst="$AGENTS/$job.plist"
  if [[ ! -f "$src" ]]; then
    echo "건너뜀: $job (원본 없음)"
    continue
  fi

  # node 경로와 WorkingDirectory 를 이 기기 값으로 치환해서 설치한다.
  # PlistBuddy 를 쓰는 이유: 경로에 공백이 있어(iCloud "Mobile Documents") sed 치환이 위험하다.
  cp "$src" "$dst"
  /usr/libexec/PlistBuddy -c "Set :ProgramArguments:0 $NODE_BIN" "$dst"
  /usr/libexec/PlistBuddy -c "Set :WorkingDirectory $REPO" "$dst"

  launchctl unload "$dst" 2>/dev/null || true
  launchctl load "$dst"
  echo "설치: $job"
done

echo
echo "확인:"
launchctl list | grep -i amswiki || echo "  (등록 실패 — 위 오류를 확인하세요)"
echo
echo "로그 보기:  tail -f $LOGDIR/kakao-collect.log"
echo
echo "⚠️ 노트북이면 뚜껑을 닫는 동안 수집이 멈춥니다."
echo "   책상에 두고 상시 수집하려면: sudo pmset -c sleep 0 disablesleep 1"
