// src/test-setup.js — vitest 전역 테스트 환경 보강 (jsdom 미구현 API 폴리필)
// jsdom은 네이티브 <dialog> 의 showModal()/close()를 구현하지 않아, 이걸 쓰는
// Astryx Dialog/AlertDialog 계열 컴포넌트를 렌더하는 테스트가 전부 실패한다.
if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true
    }
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
      this.open = false
      this.dispatchEvent(new Event('close'))
    }
  }
}
