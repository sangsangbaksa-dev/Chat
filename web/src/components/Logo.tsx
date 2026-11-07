export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="왈도쳇">
      <rect width="512" height="512" rx="112" fill="var(--accent)" />
      <path d="M148 120h216a36 36 0 0 1 36 36v136a36 36 0 0 1-36 36H252l-72 64v-64h-32a36 36 0 0 1-36-36V156a36 36 0 0 1 36-36z" fill="#fff" />
      <path d="M180 192l34 92 42-92 42 92 34-92" fill="none" stroke="var(--accent)" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
