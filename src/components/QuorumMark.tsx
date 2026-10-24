export default function QuorumMark({
  className,
  ringClassName,
  tailClassName,
}: {
  className?: string
  ringClassName: string
  tailClassName: string
}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle
        cx="12"
        cy="11.4"
        r="6.9"
        stroke="currentColor"
        strokeWidth="3.3"
        className={ringClassName}
      />
      <path
        d="M13.95 14.19L17.45 19.18"
        stroke="currentColor"
        strokeWidth="3.3"
        strokeLinecap="round"
        className={tailClassName}
      />
    </svg>
  )
}
