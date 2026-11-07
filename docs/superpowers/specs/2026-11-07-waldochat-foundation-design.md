# 왈도쳇 기반 구축 설계 (아키텍처 · 배포 · Supabase 연동)

## 범위
이번 단계는 뼈대만 다룬다: 인증(Google), 프로필, PWA 설치(QR), 푸시 알림 뼈대, 배포.
메시지/대화/스페이스는 다음 단계.

## 결정 사항
- 프런트: Vite + React + TypeScript PWA (`web/`), Vercel 정적 배포(`*.vercel.app`).
- 백엔드: Supabase 신규 프로젝트(기존 `WaldoChat` 프로젝트와 Vercel `waldo-chat`은 건드리지 않음).
- 로그인: Google OAuth(PKCE). 이메일 신원은 Google이 보증한다.
- 계정 복제 방지(서버 측, `auth.users` 트리거):
  - Gmail 정규화(점, `+별칭`, `googlemail.com` 통일)로 한 사람 한 계정.
  - 일회용 메일 도메인 차단 목록.
  - 정규화 이메일 테이블은 RLS 정책 없음 → 클라이언트에서 읽을 수 없음.
  - 한계: 서로 다른 Google 계정을 여러 개 만드는 것은 막을 수 없다.
- 푸시: Web Push(VAPID). 구독은 `register_push_subscription` RPC로만 등록
  (공유 기기에서 구독이 다른 계정으로 넘어오는 경우 소유자 재지정).
  발송은 Edge Function `send-test-push`.
- QR: `/install` 페이지가 현재 접속 주소로 QR을 생성. iOS는 "홈 화면에 추가" 안내(알림은 설치 후 16.4+).

## 검증
- SQL: 로컬 Postgres에서 마이그레이션 적용 후 중복/일회용/RLS/RPC 시나리오 검증.
- E2E(Playwright, Supabase는 모의): 로그인 화면, OAuth/PKCE 시작, 가입 차단 안내, 인증 후 화면,
  QR, manifest/아이콘/서비스 워커, 알림 구독 RPC, 모바일 레이아웃.
