# 왈도쳇 (WaldoChat)

구글챗 스타일 채팅 PWA. Vite + React + Supabase, Vercel 배포.

## 구조
- `web/` — 프런트엔드 (PWA)
- `supabase/migrations/` — DB 스키마 (프로필, 계정 중복 방지, 푸시 구독)
- `supabase/functions/send-test-push/` — 테스트 푸시 Edge Function

## 로컬 실행
```bash
cd web
cp .env.example .env   # 값 채우기
npm install
npm run dev
```

## 테스트
```bash
cd web && npx playwright test --trace off
```

## 설정 체크리스트 (한 번만)
1. Supabase 프로젝트에 `supabase/migrations/*.sql` 적용
2. Google Cloud Console에서 OAuth 클라이언트(웹) 생성 →
   승인된 리디렉션 URI: `https://<프로젝트ref>.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Providers → Google에 Client ID/Secret 입력
4. Supabase → Authentication → URL Configuration: Site URL과 Redirect URLs에 Vercel 주소 추가
5. VAPID 키 생성: `npx web-push generate-vapid-keys`
   - 공개키 → Vercel 환경변수 `VITE_VAPID_PUBLIC_KEY`
   - 공개/비공개 키, `VAPID_SUBJECT` → Edge Function 시크릿
6. Vercel 환경변수: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`

## 알려진 한계
- Supabase 기본 SMTP는 발송 한도가 매우 낮다(Google 로그인만 쓰는 현재는 영향 없음).
- iPhone 푸시는 홈 화면에 설치한 뒤에만 동작한다.
