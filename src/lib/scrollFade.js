// src/lib/scrollFade.js
// 스크롤바를 평소엔 숨기고 "스크롤 중"에만 반투명으로 보여주는 전역 유틸.
// CSS(index.css의 .is-scrolling 규칙)와 짝을 이룬다. 어느 요소에서 스크롤이 나든
// capture 단계(스크롤 이벤트는 버블링하지 않음)로 감지해 <html>에 클래스를 잠깐 붙인다.
let timer = null

function onScroll() {
  document.documentElement.classList.add('is-scrolling')
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    document.documentElement.classList.remove('is-scrolling')
  }, 650)
}

export function initScrollFade() {
  if (typeof document === 'undefined') return
  document.addEventListener('scroll', onScroll, { capture: true, passive: true })
}
