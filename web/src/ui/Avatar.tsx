import { avatarColors, initial } from '../lib/format'

export function Avatar({ name, seed, size = 36, square }: { name: string; seed?: string; size?: number; square?: boolean }) {
  const { fg } = avatarColors(seed ?? name)
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        borderRadius: square ? size * 0.28 : '50%',
        background: `color-mix(in srgb, ${fg} 16%, transparent)`,
        color: `color-mix(in srgb, ${fg} 82%, var(--text))`,
      }}
    >
      {initial(name)}
    </span>
  )
}
