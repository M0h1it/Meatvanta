/** Three little flames; `bars` of them lit. Drawn inline so no icon font is needed. */
export default function FlameIcon({ bars = 0, className = "" }) {
  return (
    <span className={`inline-flex items-end gap-px ${className}`} aria-hidden="true">
      {[1, 2, 3].map((n) => (
        <svg key={n} viewBox="0 0 12 16" width={8 + n * 2} height={10 + n * 3} className={n <= bars ? "text-primary" : "text-outline-variant"}>
          <path fill="currentColor" d="M6 0c1 3 5 5 5 9.5A5 5 0 0 1 1 9.5C1 7 3 6 3 3.5 4.5 5 5 6 5 7.5 6.5 6 6.5 3 6 0z" />
        </svg>
      ))}
    </span>
  );
}
