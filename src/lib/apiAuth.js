// src/lib/apiAuth.js
// 우리 서버리스 함수(/api/*)를 부를 때 붙일 로그인 토큰 헤더를 만든다.
//
// 배경: /api/search-summary 는 호출 한 번마다 Anthropic 요금이 나가는데 인증 검사가
// 없었다. 서버 쪽에 로그인 확인을 넣으면서, 클라이언트도 현재 세션 토큰을 같이 보내야 한다.
//
// Supabase 미설정(로컬 목데이터 모드)이거나 로그인 전이면 빈 객체를 준다. 이때 서버는
// 환경변수가 없으면 검사를 건너뛰고, 있으면 401을 돌려준다.

import { supabase } from './supabase'

export async function authHeaders() {
  if (!supabase) return {}
  try {
    // getSession 은 localStorage 를 읽는 로컬 동작이라 네트워크 왕복이 없다.
    // 만료가 임박하면 supabase-js 가 알아서 갱신한다(autoRefreshToken).
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    return token ? { authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}
