export function Logo({ size = 32 }: { size?: number }) {
  return <img src="/favicon.svg" width={size} height={size} alt="왈도쳇" style={{ borderRadius: size * 0.22 }} />
}
