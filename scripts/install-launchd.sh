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
#   2) WorkingDirectory 와 --env-file 을 지금 이 저장소 절대경로로 바꾼다.
#   3) ~/Library/LaunchAgents 에 복사하고 불러온다(이미 있으면 먼저 내린다).
#   4) 15초 기다렸다가 오류 로그를 읽어 "실제로 도는지"까지 보고한다.
#
# 실행:
#   bash scripts/install-launchd.sh                       # 쿠키 갱신 (기본 — 수집은 클라우드)
#   bash scripts/install-launchd.sh --with-local-collect   # 기기에서도 수집 (클라우드 장애 대비)
#   bash scripts/install-launchd.sh --all                  # 잔디 토큰·시트 동기화까지 전부
#   bash scripts/install-launchd.sh --list                 # 지금 이 기기에 뭐가 걸려 있는지만 보기
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
LOGDIR="$HOME/Library/Logs/ams-wiki"

# 불러오기 직전 오류 로그 크기(바이트)를 잡 순서대로 담는다.
# ⚠️ 연관 배열(declare -A)을 쓰지 말 것 — macOS 기본 bash 는 3.2 라 지원하지 않는다.
#    (개발 환경 bash 5.x 에서는 통과하고 실제 맥에서만 깨진다.) 인덱스 배열로 간다.
ERR_OFFSETS=()

# 기본은 쿠키 갱신만. 수집 본체는 2026-08-13 부터 클라우드(Supabase pg_cron 5분)가 한다
# — 클라우드 IP 차단이라는 이전 판단이 재측정으로 뒤집혔다. 이 기기의 역할은 "Chrome 로그인
# 세션에서 쿠키를 꺼내 보관함에 넣는 것" 하나뿐이라, 기기가 자도 수집은 계속 돈다.
# 기기에서도 수집을 돌리려면(클라우드 장애 대비) --with-local-collect.
DEFAULT_JOBS=(com.amswiki.kakao-cookie-refresh)
ALL_JOBS=("${DEFAULT_JOBS[@]}" com.amswiki.kakao-collect com.amswiki.jandi-token-refresh com.amswiki.kakao-sheets-sync)

if [[ "${1:-}" == "--list" ]]; then
  echo "이 기기에 걸린 ams-wiki 예약:"
  launchctl list | grep -i amswiki || echo "  (없음)"
  exit 0
fi

JOBS=("${DEFAULT_JOBS[@]}")
case "${1:-}" in
  --all)                JOBS=("${ALL_JOBS[@]}") ;;
  --with-local-collect) JOBS=("${DEFAULT_JOBS[@]}" com.amswiki.kakao-collect) ;;
esac

# 기본 설치로 돌아왔는데 예전 수집 잡이 남아 있으면 내린다(클라우드와 중복 호출 방지).
if [[ "${1:-}" != "--all" && "${1:-}" != "--with-local-collect" ]]; then
  old="$AGENTS/com.amswiki.kakao-collect.plist"
  if [[ -f "$old" ]]; then
    launchctl unload "$old" 2>/dev/null || true
    rm -f "$old"
    echo "정리: com.amswiki.kakao-collect 내림 (수집은 이제 클라우드가 합니다)"
  fi
fi

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

for i in "${!JOBS[@]}"; do
  job="${JOBS[$i]}"
  src="$REPO/scripts/launchd/$job.plist"
  dst="$AGENTS/$job.plist"
  if [[ ! -f "$src" ]]; then
    echo "건너뜀: $job (원본 없음)"
    ERR_OFFSETS[$i]=-1   # 건너뛴 잡은 아래 확인에서도 건너뛴다
    continue
  fi

  # node 경로·env 파일 경로·WorkingDirectory 를 이 기기 값으로 치환해서 설치한다.
  # PlistBuddy 를 쓰는 이유: 경로에 공백이 있어(iCloud "Mobile Documents") sed 치환이 위험하다.
  cp "$src" "$dst"
  /usr/libexec/PlistBuddy -c "Set :ProgramArguments:0 $NODE_BIN" "$dst"
  /usr/libexec/PlistBuddy -c "Set :WorkingDirectory $REPO" "$dst"

  # ⚠️ --env-file 은 반드시 절대경로로 박는다.
  # plist 원본에는 `--env-file=.env.local` 로 상대경로가 적혀 있는데, launchd 로 돌리면
  # 이게 해석되지 않아 `node: .env.local: invalid format` 으로 시작하자마자 죽는다
  # (2026-08-13 맥북 에어 실측 — 같은 명령을 터미널에서 직접 치면 정상 동작해서
  #  파일 내용 문제로 오인하기 쉽다. 차이는 실행 시점의 현재 폴더뿐이다).
  if /usr/libexec/PlistBuddy -c "Print :ProgramArguments:1" "$dst" 2>/dev/null | grep -q -- '--env-file'; then
    /usr/libexec/PlistBuddy -c "Set :ProgramArguments:1 --env-file=$REPO/.env.local" "$dst"
  fi

  # 불러오기 직전의 오류 로그 크기를 기억해 둔다. 아래 동작 확인에서 "이 지점 이후에
  # 새로 쓰인 것"만 보기 위해서다 — 로그는 계속 쌓이므로 그냥 tail 하면 몇 시간 전 오류를
  # 지금 오류로 오인한다(2026-08-13 실측: 수집이 멀쩡히 도는데 ❌ 로 보고했다).
  short="${job#com.amswiki.}"
  errfile="$LOGDIR/$short.err.log"
  [[ -f "$errfile" ]] || : > "$errfile"
  ERR_OFFSETS[$i]=$(wc -c < "$errfile" | tr -d ' ')

  launchctl unload "$dst" 2>/dev/null || true
  launchctl load "$dst"
  echo "설치: $job"
done

echo
echo "등록 확인:"
launchctl list | grep -i amswiki || echo "  (등록 실패 — 위 오류를 확인하세요)"

# ── 등록됐다고 도는 게 아니다 ─────────────────────────────────────────────────
# 2026-08-13 실측: 등록은 성공했는데 두 잡 다 시작하자마자 죽어(위 --env-file 문제)
# 수집이 계속 0건이었다. 그때 이 스크립트는 "설치 완료"만 찍고 끝나 한참 뒤에야 알았다.
# → 오류 로그를 직접 읽어 보고한다. "검증 전 완료 금지"를 스크립트로 강제하는 것이다.
#
# ⚠️ 반드시 "이번 실행에서 새로 쓰인 부분"만 본다. 로그는 계속 쌓이므로 그냥 tail 하면
#    몇 시간 전에 끝난 사건을 지금 오류로 오인한다(같은 날 실측 — 수집이 정상인데 ❌ 로 보고).
echo
echo "동작 확인 (15초 대기)..."
sleep 15
fail=0
for i in "${!JOBS[@]}"; do
  off="${ERR_OFFSETS[$i]:--1}"
  [[ "$off" == "-1" ]] && continue
  short="${JOBS[$i]#com.amswiki.}"
  err="$LOGDIR/$short.err.log"
  fresh="$(tail -c "+$((off + 1))" "$err" 2>/dev/null || true)"
  if [[ -n "$fresh" ]] && printf '%s' "$fresh" | grep -qiE 'invalid format|cannot find|ENOENT|쿠키 만료|Error'; then
    echo "  ❌ $short — 오류로 죽었습니다:"
    printf '%s\n' "$fresh" | tail -3 | sed 's/^/       /'
    fail=1
  else
    echo "  ✅ $short — 새 오류 없음"
  fi
done

echo
if [[ $fail -eq 1 ]]; then
  echo "⚠️ 위 오류를 먼저 해결해야 수집이 시작됩니다."
else
  echo "로그 보기:  tail -f $LOGDIR/kakao-cookie-refresh.log"
fi
echo
echo "수집은 클라우드(Supabase, 5분)가 합니다 — 이 기기가 자도 계속 돕니다."
echo "다만 쿠키 갱신은 이 기기에서만 되므로, 오래 꺼두면 결국 쿠키가 만료됩니다."
echo "상시 켜두려면: sudo pmset -c sleep 0 disablesleep 1"
