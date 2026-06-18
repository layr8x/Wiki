# AMS Wiki 기여 가이드

AMS Wiki 프로젝트에 기여해주셔서 감사합니다! 이 가이드는 프로젝트에 기여하는 방법을 설명합니다.

## 커밋 메시지 규칙

모든 커밋은 한글로 작성하며 다음 형식을 따릅니다:

```
<타입>: <제목>

<선택사항 상세 설명>

<선택사항 이슈 참조>
```

### 커밋 타입

- **기능** (`기능:`): 새로운 기능 추가
- **수정** (`수정:`): 버그 수정
- **개선** (`개선:`): 기존 기능 개선
- **성능** (`성능:`): 성능 최적화
- **테스트** (`테스트:`): 테스트 추가/수정
- **문서** (`문서:`): 문서 추가/수정
- **리팩터링** (`리팩터링:`): 코드 구조 개선
- **Chore** (`chore:`): 빌드, 의존성 등 변경

### 예제

```
기능: 사용자 검색 필터 추가

GuideListPage에 사용자 정의 검색 필터를 추가하여
모듈, 유형, 태그별로 가이드를 필터링할 수 있도록 함.
useGuideFilter 훅을 통해 상태 관리.

#123 (이슈 번호)
```

## 브랜치 명칭 규칙

```
<타입>-<설명>-<난수>
```

예:
- `feature-korean-translation-aBc3D` - 새 기능
- `fix-dark-mode-rendering-Xy9Zw` - 버그 수정
- `docs-update-readme-DeF7g` - 문서 업데이트

## 개발 프로세스

### 1. 로컬 환경 설정

```bash
# 저장소 클론
git clone https://github.com/layr8x/sdij-wiki.git
cd sdij-wiki

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

### 2. 기능 개발

```bash
# 새 브랜치 생성
git checkout -b feature-my-feature-ABC123

# 변경사항 작성
# ... 코드 편집 ...

# 변경사항 확인
npm run lint
npm run build
npm run test:e2e  # 선택사항
```

### 3. 커밋

```bash
# 파일 추가
git add src/components/MyComponent.jsx

# 커밋 (한글 메시지)
git commit -m "기능: MyComponent 추가

새로운 컴포넌트 MyComponent를 추가하여
사용자가 ... 할 수 있도록 함.

#456"
```

### 4. 푸시 및 PR 생성

```bash
# 브랜치 푸시
git push origin feature-my-feature-ABC123

# GitHub에서 PR 생성
# 1. 브라우저에서 PR 생성
# 2. main 브랜치를 base로 선택
# 3. 상세 설명 작성
```

### 5. 코드 리뷰

- CI/CD 체크 통과 필요
- 최소 1명의 리뷰 필요
- 변경사항 요청 시 반영

### 6. 병합

PR이 승인되면 main 브랜치에 병합됩니다.

## 코딩 규칙

### JavaScript/React

1. **파일 크기**: 한 파일 최대 500줄 (필요시 분할)
2. **컴포넌트**: 함수형 컴포넌트 사용
3. **훅**: 커스텀 훅은 `src/hooks/` 디렉토리에
4. **상태 관리**: Context + Hooks (Redux 불필요)
5. **주석**: 한글로 작성, 복잡한 로직에만 추가

### 파일 명칭

- **컴포넌트**: PascalCase (예: `MyComponent.jsx`)
- **훅**: camelCase (예: `useMyHook.js`)
- **유틸**: camelCase (예: `myUtil.js`)
- **폴더**: kebab-case (예: `my-folder/`)

### CSS/Styling

1. **색상**: CSS 변수 사용 (`var(--color-primary)`)
2. **다크 모드**: `html.dark` 스타일 지정
3. **반응형**: `useMediaQuery` 훅 사용
4. **Tailwind**: 인라인 스타일 또는 CSS 모듈

### 컴포넌트 템플릿

```javascript
// src/components/MyComponent.jsx
import { useState } from 'react';
import { MyIcon } from 'lucide-react';

// 주석: 간단한 설명
export default function MyComponent({ title, onAction }) {
  const [state, setState] = useState(false);

  return (
    <div style={{ padding: '16px' }}>
      <MyIcon size={24} />
      <h2>{title}</h2>
      <button onClick={() => onAction()}>
        클릭
      </button>
    </div>
  );
}
```

## 테스트 작성

### E2E 테스트 (Playwright)

```javascript
// e2e/my-feature.spec.js
import { test, expect } from '@playwright/test';

test.describe('My Feature', () => {
  test('기능이 작동해야 함', async ({ page }) => {
    await page.goto('/');
    
    const button = page.locator('button:has-text("클릭")');
    await expect(button).toBeVisible();
    
    await button.click();
    // ... 더 많은 어서션 ...
  });
});
```

### 유닛 테스트 (Vitest)

```javascript
// src/utils/__tests__/myUtil.test.js
import { describe, it, expect } from 'vitest';
import { myFunction } from '../myUtil';

describe('myUtil', () => {
  it('입력값을 변환해야 함', () => {
    expect(myFunction('test')).toBe('TEST');
  });
});
```

## PR 체크리스트

PR을 생성하기 전에 다음을 확인하세요:

- [ ] 한글 커밋 메시지 사용
- [ ] `npm run lint` 통과
- [ ] `npm run build` 성공
- [ ] 새로운 기능에 대해 E2E 테스트 작성
- [ ] 코드 주석 한글로 작성
- [ ] 문서 업데이트 (필요시)
- [ ] 스크린샷 추가 (UI 변경시)

## 문서 작성

### Markdown 스타일

```markdown
# 제목

## 소제목

- 목록 항목
- 또 다른 항목

### 코드 예제

\`\`\`javascript
const example = () => console.log('예제');
\`\`\`

**굵은 텍스트** 및 *이탤릭*
```

### 문서 파일 위치

- 사용자 가이드: `docs/USER_GUIDE.md`
- 개발 가이드: `docs/DEVELOPMENT.md`
- API 문서: `docs/API.md`
- 배포: `docs/DEPLOYMENT.md`

## 버그 리포트

버그를 찾은 경우:

1. **GitHub Issues** 에서 새 이슈 생성
2. **제목**: 명확한 버그 설명 (한글)
3. **설명**: 
   - 버그 재현 단계
   - 예상 동작
   - 실제 동작
   - 스크린샷 (필요시)
4. **라벨**: `bug` 추가

## 기능 요청

새로운 기능을 제안할 때:

1. **GitHub Issues** 에서 새 이슈 생성
2. **제목**: 기능 요청 (한글)
3. **설명**:
   - 문제 상황
   - 제안된 해결책
   - 대안 (있으면)
4. **라벨**: `enhancement` 추가

## 질문 및 지원

- **기술 질문**: GitHub Discussions 사용
- **버그 리포트**: GitHub Issues 사용
- **보안 이슈**: 직접 연락 (issue 공개 금지)

## 라이선스

이 프로젝트는 MIT 라이선스를 따릅니다.
기여함으로써 이 라이선스에 동의하는 것입니다.

## 행동 강령

우리 커뮤니티에 참여하려면:

- 존중과 포용을 우선으로
- 다른 의견 존중
- 건설적인 피드백 제공
- 괴롭힘이나 차별 금지

## 감사의 말

AMS Wiki 프로젝트에 기여해주셔서 감사합니다!
여러분의 노력으로 더 나은 제품을 만들어갈 수 있습니다.

---

**Questions?** GitHub Discussions에서 질문해주세요.
**Code style?** ESLint가 자동으로 확인합니다 (`npm run lint --fix`).
