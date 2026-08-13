import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * 지정한 폭보다 창이 좁은지. 화면마다 "좁다"의 기준이 다르다 —
 * 피드백 표는 768px, 가이드 표는 열이 여섯 개라 900px 부터 이미 위험하다(실측).
 * CSS 로는 열 정의 배열 자체를 바꿀 수 없어(Astryx Table 에 열 자동 숨김이 없다) JS 로 판단한다.
 */
export function useIsNarrow(breakpoint = MOBILE_BREAKPOINT) {
  // 초기값을 lazy 로 계산 — effect 내 동기 setState 제거 (cascading render 방지)
  const [isNarrow, setIsNarrow] = React.useState(
    () => typeof window !== "undefined" && window.innerWidth < breakpoint
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const onChange = () => setIsNarrow(window.innerWidth < breakpoint)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint])

  return !!isNarrow
}

export function useIsMobile() {
  return useIsNarrow(MOBILE_BREAKPOINT)
}
