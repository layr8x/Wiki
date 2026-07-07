// src/pages/AstryxPocPage.jsx
// Astryx(Meta 디자인시스템) 마이그레이션 PoC — 격리 검증용 라우트(/astryx-poc).
//
// 목적: sdij-wiki(shadcn/Tailwind)를 Astryx로 점진 이전하기 전에, Theme provider·
//   토큰·컴포넌트·light/dark 전환·빌드가 실제로 동작하는지 프로덕션 라우트와 분리해 검증한다.
//
// 격리 원칙:
//   - 전역 reset.css 는 기존 페이지에 영향을 주므로 import 하지 않는다.
//   - astryx.css 는 `.astryx-*` 클래스만, theme.css 는 [data-astryx-theme] 스코프만 건드려 안전.
//   - 이 라우트는 lazy 로딩 → 방문 시에만 해당 CSS/컴포넌트를 로드한다.
//   - Astryx 규칙 준수: raw div 최소화(호스트만), 인라인 style 없음, 색은 토큰(var)만.
import { useState } from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Switch } from '@astryxdesign/core/Switch';
import { Badge } from '@astryxdesign/core/Badge';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';

import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import './AstryxPocPage.css';

export default function AstryxPocPage() {
  const [mode, setMode] = useState('light');

  return (
    <Theme theme={neutralTheme} mode={mode}>
      <div className="astryx-poc-host">
        <div className="astryx-poc-inner">
          <VStack gap={4}>
            <VStack gap={1}>
              <Heading level={1}>Astryx PoC · sdij-wiki</Heading>
              <Text type="supporting">
                프로덕션 라우트와 분리된 격리 검증 페이지입니다. Theme·토큰·컴포넌트·라이트/다크 전환·빌드 확인용.
              </Text>
            </VStack>

            <Card>
              <VStack gap={3}>
                <Heading level={3}>배지 (상태 토큰)</Heading>
                <HStack gap={2}>
                  <Badge label="neutral" variant="neutral" />
                  <Badge label="info" variant="info" />
                  <Badge label="success" variant="success" />
                  <Badge label="warning" variant="warning" />
                  <Badge label="error" variant="error" />
                </HStack>
              </VStack>
            </Card>

            <Card>
              <VStack gap={3}>
                <Heading level={3}>버튼</Heading>
                <HStack gap={2}>
                  <Button label="Primary" variant="primary" onClick={() => {}} />
                  <Button label="Secondary" variant="secondary" onClick={() => {}} />
                  <Button label="Tertiary" variant="tertiary" onClick={() => {}} />
                </HStack>
              </VStack>
            </Card>

            <Card>
              <VStack gap={3}>
                <Heading level={3}>테마 모드 (light / dark)</Heading>
                <Switch
                  label="다크 모드"
                  description="Astryx neutral 테마의 라이트/다크 토큰 전환을 검증합니다."
                  value={mode === 'dark'}
                  onChange={(checked) => setMode(checked ? 'dark' : 'light')}
                />
                <Text type="supporting">현재 모드: {mode}</Text>
              </VStack>
            </Card>
          </VStack>
        </div>
      </div>
    </Theme>
  );
}
