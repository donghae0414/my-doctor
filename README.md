# My Doctor

산후 산모와 영아를 위한 비공개 한국어 의료 정보 채팅입니다. OpenAI 모델과 웹 검색을 이용해 근거가 포함된 답변을 스트리밍하며, 이미지 첨부와 비밀번호 잠금 화면을 지원합니다.

이 서비스는 일반적인 의료 정보와 진료 준비를 돕기 위한 것으로, 의료진의 진단이나 처방을 대신하지 않습니다.

## 기술 스택

- Next.js 16, React 19, TypeScript
- Vercel AI SDK (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`)와 OpenAI API
- Tailwind CSS 4, shadcn/ui, Radix UI
- tweakcn [Claude + 테마](https://tweakcn.com/themes/cmdght103000n04lh3e2ae93r)
- Vitest, Testing Library, Playwright, Biome

정확한 패키지 버전과 스크립트는 [`package.json`](./package.json)을 기준으로 합니다.

## 로컬 실행

Node.js 20.9 이상과 pnpm이 필요합니다.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다.

## 환경 변수

| 이름 | 설명 |
| --- | --- |
| `OPENAI_API_KEY` | 서버에서 사용하는 OpenAI API 키 |
| `DOORLOCK_PASSWORD` | 잠금 화면에서 사용할 4~12자리 숫자 비밀번호 |
| `AUTH_SECRET` | 세션 서명에 사용할 32바이트 이상의 base64url 비밀키 |

`AUTH_SECRET`은 다음과 같이 생성할 수 있습니다.

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
```

`.env.local`과 비밀값은 저장소에 커밋하지 않습니다. `OPENAI_API_KEY`는 서버 전용이며 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다.

## 개발

채팅 화면은 Vercel AI SDK의 `useChat`으로 `/api/chat`에 요청하고, 서버 Route Handler가 OpenAI 응답과 검색 출처를 스트리밍합니다. OpenAI 호출, 인증 검사, 입력 검증은 서버 경계 안에서 처리합니다.

UI 컴포넌트 설정은 [`components.json`](./components.json), tweakcn 테마와 화면 설계 기준은 [`DESIGN.md`](./DESIGN.md), 실제 전역 토큰은 [`app/globals.css`](./app/globals.css)에 있습니다. 새 UI는 기존 `components/ui`와 디자인 토큰을 우선 사용합니다.

| 명령 | 용도 |
| --- | --- |
| `pnpm dev` | 개발 서버 실행 |
| `pnpm lint` | Biome 린트 검사 |
| `pnpm typecheck` | TypeScript 타입 검사 |
| `pnpm test` | Vitest 실행 |
| `pnpm test:e2e` | Playwright E2E 테스트 실행 |
| `pnpm build` | 프로덕션 빌드 확인 |

## 배포

Vercel 프로젝트에 `OPENAI_API_KEY`, `DOORLOCK_PASSWORD`, `AUTH_SECRET`을 서버 환경 변수로 등록한 뒤 배포합니다. 배포 전 `pnpm build`를 통과해야 합니다.
