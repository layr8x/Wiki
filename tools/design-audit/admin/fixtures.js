// tools/design-audit/admin/fixtures.js
// 관리자 화면 렌더 하네스용 고정 데이터.
//
// ⚠️ 개인정보 금지 — 실제 고객 닉네임·상담 본문은 절대 넣지 않는다.
//    아래 값은 전부 **지어낸 것**이다. 실제와 같은 건 "형태"(필드·길이·분포)뿐이고,
//    화면이 어떻게 보이는지 판단하는 데 필요한 만큼만 현실적으로 만들었다.
//    (실데이터 형태 참고: 채널 5개 · 하루 165건 규모 · 응답 중앙값 19~32분)

const CHANNELS = ['마이클래스', 'LIVE', 'LIVE 기술지원', '콘텐츠', '통합로그인']

// 긴 값·짧은 값을 섞어 "글자가 길어지면 깨지는가"를 같이 본다.
const NICKS = ['별빛사탕', '수학이좋아요', '학부모A', '가나다라마바사아자차카', 'jin', '민들레홀씨', '연구실지킴이']
const PREVIEWS = [
  '결제했는데 수강신청이 안 돼요',
  '교재 배송 언제 오나요?',
  '라이브 화면이 자꾸 끊깁니다 접속은 되는데 소리만 나오고 영상이 멈춰요',
  '환불 요청드립니다',
  '아이디를 잊어버렸어요',
  '보강 신청 방법 알려주세요',
]

const iso = (minutesAgo) => new Date(Date.UTC(2026, 7, 13, 4, 0, 0) - minutesAgo * 60000).toISOString()

// ─── 상담 메시지(카카오 상담 로그 화면) ────────────────────────────────────
// 대화 6묶음 × 메시지 3~7개. 고객(in)/매니저(out)/시스템을 섞는다.
const messages = []
let logId = 4900000000000000
for (let c = 0; c < 6; c++) {
  const chatId = String(4980000000000000 + c * 137)
  const n = 3 + (c % 5)
  for (let i = 0; i < n; i++) {
    const isUser = i % 2 === 0
    messages.push({
      log_id: String(logId++),
      chat_id: chatId,
      profile_id: '_VGAQn',
      sender_type: i === n - 1 && c % 4 === 3 ? 'system' : isUser ? 'user' : 'manager',
      message:
        i === 0
          ? PREVIEWS[(c + i) % PREVIEWS.length]
          : isUser
            ? '네 확인했습니다. 그런데 아직 화면에는 반영이 안 된 것 같아요.'
            : '안녕하세요, 시대인재입니다. 확인 후 순차적으로 처리해 드리고 있습니다. 잠시만 기다려 주세요.',
      message_type: 'text',
      sent_at: iso(c * 90 + (n - i) * 7),
      manager_name: isUser ? null : '상담원' + ((c % 3) + 1),
      nickname: NICKS[c % NICKS.length],
    })
  }
}

// ─── 채팅 메타 ─────────────────────────────────────────────────────────────
const chats = Array.from({ length: 6 }, (_, c) => ({
  chat_id: String(4980000000000000 + c * 137),
  profile_id: '_VGAQn',
  nickname: NICKS[c % NICKS.length],
  last_log_send_at: iso(c * 90),
  category: ['환불', '교재·배송', '라이브', '계정·로그인·앱', '입반·등록', '기타'][c % 6],
}))

export const FIXTURES = {
  kakao_partner_messages: messages,
  kakao_partner_chats: chats,
  // ⚠️ 본문 컬럼 이름은 `message` 다(화면이 m.message 를 읽는다). 예전 대역은 `text` 로 넣어
  //    모든 메시지가 "(본문 없음)"·"(내용 없음)"으로 렌더돼, 이 화면의 글자 길이·줄바꿈을
  //    한 번도 제대로 검증하지 못하고 있었다.
  //    link_id 는 화면이 스레드 묶음 키로 쓴다. 길이가 제각각이어야 줄바꿈을 확인할 수 있다.
  jandi_messages: [
    '이번 주 배포 일정 공유드립니다. 확인 부탁드려요.',
    '넵 확인했습니다.',
    '카카오 상담 수집이 어제 새벽부터 멈춰 있었는데, 원인 파악해서 오늘 오전에 복구했습니다. 원인은 클라우드 IP 차단이었고 수집 위치를 사내 기기로 옮겼습니다.',
    '고생하셨습니다 🙏',
    '대시보드 응답시간 분포 카드에서 1위 항목 막대가 항상 꽉 차 보이는 문제가 있어 보입니다.',
    '그건 분모를 1위 값으로 잡고 있어서 그렇습니다. 전체 대비로 바꾸겠습니다.',
    '감사합니다.',
    '내일 오전 10시에 짧게 싱크 가능하실까요?',
  ].map((message, i) => ({
    link_id: String(9000 + i),
    message_id: String(9000 + i),
    room_id: 'room' + (i % 3),
    room_name: ['플랫폼서비스팀', '캠퍼스파트', 'TECH 공지'][i % 3],
    writer_id: String(10 + (i % 3)),
    writer_name: ['김명준', '박미혜', '김수민'][i % 3],
    content_type: 'text',
    message,
    reply_to_message_id: i % 4 === 3 ? String(9000 + i - 1) : null,
    created_at: iso(i * 45),
  })),
  // ⚠️ module 값은 MODULE_TREE 의 label 과 글자까지 같아야 한다. 대시보드의 모듈별 분포가
  //    label 로 맞춰 세기 때문에, 임의 이름("출결"·"수납")을 쓰면 전 모듈이 0으로 보인다.
  //    개수도 모듈마다 다르게 둬야 막대 길이 차이를 눈으로 확인할 수 있다.
  guides: [
    ['출결 처리 매뉴얼', '수업운영관리'],
    ['보강 배정 절차', '수업운영관리'],
    ['시간표 변경 처리', '수업운영관리'],
    ['결석 사후 처리', '수업운영관리'],
    ['수납·환불 가이드', '청구/수납/결제/환불'],
    ['가상계좌 발급 안내', '청구/수납/결제/환불'],
    ['부분 환불 처리', '청구/수납/결제/환불'],
    ['교재 배송 프로세스', '강좌/교재 관리'],
    ['강좌 개설 체크리스트', '강좌/교재 관리'],
    ['라이브 장애 대응', '영상/VOD 관리'],
    ['신규 입반 등록', '모집/접수 관리'],
    ['공지 발송 규칙', '메시지발송 관리'],
  ].map(([title, module], i) => ({
    id: 'g' + i,
    title,
    module,
    status: i % 4 === 0 ? 'draft' : 'published',
    updated_at: iso(i * 600),
    views: 1200 - i * 87,
  })),
  guide_feedback: Array.from({ length: 4 }, (_, i) => ({
    id: 'f' + i,
    guide_id: 'g' + i,
    guide_title: ['출결 처리 매뉴얼', '수납·환불 가이드', '교재 배송 프로세스', '라이브 장애 대응'][i],
    rating: i % 2 === 0 ? 'helpful' : 'unhelpful',
    comment: '화면 캡처가 예전 버전이라 지금이랑 달라요.',
    created_at: iso(i * 300),
  })),
  search_logs: [],
  faq_views: [],
}

// ─── RPC 응답 ──────────────────────────────────────────────────────────────
// 분포 RPC 는 개수(cnt)와 함께 전체 대비 비율(pct)을 돌려준다. 대역 데이터에서도 같은 방식으로
// 계산해 둬야 화면의 막대 길이·비율 표기를 실제와 같게 검증할 수 있다.
const withPct = (rows) => {
  const total = rows.reduce((s, r) => s + r.cnt, 0) || 1
  return rows.map((r) => ({ ...r, pct: Math.round((r.cnt / total) * 1000) / 10 }))
}

export function rpcFixture(name) {
  switch (name) {
    case 'kakao_sla_status':
      return [
        { channel: '콘텐츠', waiting: 3, answered_n: 121, oldest_wait_h: 18.6, median_first_response_min: 28 },
        { channel: 'LIVE', waiting: 2, answered_n: 151, oldest_wait_h: 10.0, median_first_response_min: 19 },
        { channel: '마이클래스', waiting: 2, answered_n: 50, oldest_wait_h: 40.0, median_first_response_min: 12 },
        { channel: '통합로그인', waiting: 0, answered_n: 0, oldest_wait_h: 0, median_first_response_min: 0 },
        { channel: 'LIVE 기술지원', waiting: 0, answered_n: 7, oldest_wait_h: 0, median_first_response_min: 0 },
      ]
    case 'kakao_action_chats':
      return Array.from({ length: 6 }, (_, i) => ({
        channel: CHANNELS[i % CHANNELS.length],
        nickname: NICKS[i % NICKS.length],
        waited_h: [40.0, 18.6, 10.0, 3.2, 0.8, 0.2][i],
        preview: PREVIEWS[i % PREVIEWS.length],
      }))
    case 'kakao_category_spike':
      return [
        {
          d: '2026-08-13', category: '라이브', cnt: 41, baseline_7d: 12.4, ratio: 3.31,
          channel_breakdown: [{ channel: 'LIVE', cnt: 33 }, { channel: '콘텐츠', cnt: 8 }],
        },
      ]
    case 'kakao_sentiment_trend':
      return [
        { channel: '콘텐츠', cur_neg: 22, cur_total: 96, cur_rate: 22.9, prev_neg: 11, prev_total: 88, prev_rate: 12.5, worsening: true },
        { channel: 'LIVE', cur_neg: 18, cur_total: 210, cur_rate: 8.6, prev_neg: 21, prev_total: 198, prev_rate: 10.6, worsening: false },
      ]
    case 'kakao_collection_health':
      return CHANNELS.map((label, i) => ({
        profile_id: ['_VGAQn', '_rcpPG', '_TkpPG', '_xfxilXn', '_rkbcn'][i],
        channel_label: label,
        hb_age_min: [2.6, 3.1, 4.0, 2.9, 5.2][i],
        last_error: null,
        avg_per_day: [18.2, 312.5, 3.1, 44.0, 1.2][i],
        hrs_since_msg: [0.2, 0.1, 6.4, 0.3, 22.0][i],
        gap_threshold_h: 6.0,
        health: 'ok',
        health_reason: 'ok',
      }))
    // ⚠️ 버킷 이름은 실제 RPC 가 돌려주는 형태 그대로여야 한다("00. 0-5분" 처럼 정렬용 번호가 붙어
    //    나오고, db.js 가 앞의 번호를 떼어낸다). 예전 대역은 "5분 이내" 같은 임의 이름이라
    //    화면의 색 매핑(BUCKET_VARIANT)에 하나도 안 걸렸다.
    //    pct 도 실제 RPC 가 함께 주는 값인데 빠져 있어 화면에 "NaN%" 가 찍히고 있었다.
    case 'get_response_time_distribution':
      return withPct([
        { bucket: '00. 0-5분', cnt: 412 }, { bucket: '01. 5-30분', cnt: 388 },
        { bucket: '02. 30-60분', cnt: 176 }, { bucket: '03. 1-3시간', cnt: 94 },
        { bucket: '04. 3-24시간', cnt: 61 }, { bucket: '05. 24시간+', cnt: 24 },
      ])
    case 'get_chat_category_distribution':
      return withPct([
        { category: '라이브', cnt: 486, negative_rate: 12.4 }, { category: '기타', cnt: 402, negative_rate: 8.1 },
        { category: '환불', cnt: 231, negative_rate: 41.6 }, { category: '교재·배송', cnt: 188, negative_rate: 19.7 },
        { category: '계정·로그인·앱', cnt: 174, negative_rate: 22.4 }, { category: '미납·결제', cnt: 151, negative_rate: 33.8 },
        { category: '입반·등록', cnt: 96, negative_rate: 9.4 }, { category: '모의고사·서바이벌', cnt: 74, negative_rate: 5.4 },
        { category: '출결·보강', cnt: 41, negative_rate: 7.3 }, { category: '대기', cnt: 33, negative_rate: 30.3 },
        { category: '시간표·수업', cnt: 22, negative_rate: 4.5 }, { category: '퇴원·취소', cnt: 12, negative_rate: 58.3 },
      ])
    case 'get_sentiment_trend':
      return Array.from({ length: 30 }, (_, i) => ({
        day: `2026-07-${String(15 + (i % 17)).padStart(2, '0')}`,
        positive: 20 + ((i * 7) % 18),
        neutral: 45 + ((i * 3) % 20),
        negative: 6 + ((i * 5) % 11),
      }))
    case 'get_guide_stats':
      return [{ total: 42, published: 35, draft: 7, views: 18420 }]
    default:
      return []
  }
}
