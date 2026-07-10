import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { migrateLegacyKeys } from '@/lib/storageKeys'
import { initScrollFade } from '@/lib/scrollFade'

// 구버전 localStorage 키 1회 이관 — 사용자 설정(테마/언어/세션)을 잃지 않음
migrateLegacyKeys()
// 스크롤바 = 평소 숨김, 스크롤 중에만 반투명 노출
initScrollFade()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
