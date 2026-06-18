# GitHub & Vercel Pipeline Setup

이 문서는 AMS Wiki 프로젝트의 완전히 초기화된 CI/CD 파이프라인 설정을 설명합니다.

## 목차
- [개요](#개요)
- [GitHub Actions 워크플로우](#github-actions-워크플로우)
- [Vercel 배포](#vercel-배포)
- [필수 환경 변수](#필수-환경-변수)
- [배포 프로세스](#배포-프로세스)
- [문제 해결](#문제-해결)

## 개요

파이프라인은 다음 단계로 구성됩니다:

```
Code Push
   ↓
GitHub Actions CI (Linting, Building, Testing)
   ↓
Build Verification
   ↓
Deploy to Vercel (main branch only)
   ↓
Custom Domain Configuration
```

## GitHub Actions 워크플로우

### 1. CI - Quality Checks (`.github/workflows/ci.yml`)

모든 push와 pull request에서 실행되는 품질 검사:

- **quality-checks**: ESLint 린팅 및 프로젝트 빌드
- **unit-tests**: Vitest를 사용한 단위 테스트
- **security-audit**: npm audit를 통한 보안 취약점 검사

### 2. Build & Deploy (`.github/workflows/deploy.yml`)

main 브랜치로의 push에서만 실행:

- **build-and-verify**: 프로젝트 빌드 및 검증
- **deploy-to-vercel**: Vercel로 프로덕션 배포 (main만)

### 3. Setup Custom Domain (`.github/workflows/setup-domain.yml`)

수동으로 트리거할 수 있는 도메인 설정:

```bash
# GitHub Actions 탭에서 "Run workflow" 클릭
# 또는 스크립트로 트리거
```

## Vercel 배포

### 배포 설정 (`vercel.json`)

```json
{
  "buildCommand": "npm ci && npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "nodeVersion": "18.x",
  "installCommand": "npm ci",
  "regions": ["icn1"],
  "headers": [...]
}
```

### 주요 기능

- **자동 배포**: main 브랜치에 push 시 자동 배포
- **보안 헤더**: XSS, Clickjacking 방지
- **캐시 최적화**: 정적 자산에 대한 장기 캐시
- **SPA 리라우팅**: 모든 요청을 index.html로 리라우팅

## 필수 환경 변수

### GitHub Secrets 설정

1. **Repository Settings** → **Secrets and variables** → **Actions**

다음 환경 변수들을 추가해야 합니다:

#### Confluence 통합
```
VITE_CONFLUENCE_EMAIL=your-email@atlassian.com
VITE_CONFLUENCE_TOKEN=your-api-token
```

#### Vercel 배포
```
VERCEL_TOKEN=<your-vercel-token>
VERCEL_ORG_ID=<your-vercel-org-id>
VERCEL_PROJECT_ID=<your-vercel-project-id>
```

### Vercel 환경 변수

Vercel 대시보드에서 설정:

1. 프로젝트 설정 → **Environment Variables**
2. 다음 변수들 추가:

```
VITE_CONFLUENCE_EMAIL=<email>
VITE_CONFLUENCE_TOKEN=<token>
VITE_ENV=production
VITE_ENABLE_ANALYTICS=true
VITE_API_BASE_URL=https://sdij-wiki.vercel.app
```

## 배포 프로세스

### 1. 개발

```bash
# 새 브랜치 생성
git checkout -b feature/my-feature

# 변경 사항 작업
npm run dev  # 개발 서버 실행
npm run lint # 린팅 확인
npm run test # 테스트 실행

# 커밋 및 푸시
git add .
git commit -m "feat: Add new feature"
git push origin feature/my-feature
```

### 2. Pull Request

- GitHub에서 PR을 생성하면 자동으로 CI 검사 실행
- 모든 검사 통과 후 merge 가능

### 3. 배포

- main 브랜치로 merge되면 자동으로 배포 시작
- Vercel에서 배포 상태 확인 가능

### 4. 도메인 설정

필요시 수동으로 도메인 설정:

```bash
# GitHub Actions 탭 → Setup Custom Domain → Run workflow
```

## 배포 체크리스트

배포 전에 확인사항:

- [ ] 모든 CI 검사 통과
- [ ] 코드 리뷰 완료
- [ ] 테스트 커버리지 충분
- [ ] 환경 변수 설정 완료
- [ ] README 업데이트 완료

## 문제 해결

### 배포 실패

1. **GitHub Actions 로그 확인**
   - Repository → Actions → 해당 workflow 클릭
   - 실패한 step 로그 확인

2. **Vercel 배포 확인**
   - [Vercel 대시보드](https://vercel.com) 확인
   - Deployments 탭에서 상세 로그 확인

3. **환경 변수 확인**
   - GitHub Secrets 설정 확인
   - Vercel Environment Variables 확인
   - 변수명 정확성 확인

### 린팅 오류

```bash
# 린팅 오류 자동 수정
npm run lint -- --fix
```

### 테스트 실패

```bash
# 테스트 실행 및 디버그
npm run test -- --reporter=verbose
npm run test -- --watch
```

### 빌드 실패

```bash
# 로컬에서 빌드 테스트
npm ci
npm run build
```

## 관련 문서

- [프로젝트 README](../README.md)
- [기여 가이드](../.github/CONTRIBUTING.md)
- [환경 변수 설정](.env.example)

## 추가 도움말

문제가 발생하면:

1. 이 문서의 문제 해결 섹션 확인
2. GitHub Issues에서 기존 이슈 검색
3. 새로운 이슈 작성 (상세한 로그 포함)

---

**마지막 업데이트**: 2026-04-16
