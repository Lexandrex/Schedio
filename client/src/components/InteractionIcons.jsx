/**
 * Ícones de curtir, salvar e denunciar. Com `filled`, o coração e o marcador
 * se preenchem — é o estado "já marcado", como nos apps em geral.
 */
function Icon({ size, filled, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function HeartIcon({ size = 18, filled = false }) {
  return (
    <Icon size={size} filled={filled}>
      <path d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10z" />
    </Icon>
  )
}

export function BookmarkIcon({ size = 18, filled = false }) {
  return (
    <Icon size={size} filled={filled}>
      <path d="M6 4h12v16l-6-4-6 4z" />
    </Icon>
  )
}

export function AlertIcon({ size = 18 }) {
  return (
    <Icon size={size}>
      <path d="M12 4 2.5 20h19z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </Icon>
  )
}

/** Contador de likes dos cartões de projeto. */
export function LikeCount({ likes }) {
  return (
    <span className="project-likes" aria-label={`${likes} ${likes === 1 ? 'like' : 'likes'}`}>
      <HeartIcon size={13} />
      {likes}
    </span>
  )
}
