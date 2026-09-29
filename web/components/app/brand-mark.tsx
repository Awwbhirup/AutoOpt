/** Three nodes on the ramp: the flow graph the engine works on, worse to better. */
export function BrandMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <path d="M6 6 12 18 18 6" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
      <circle cx="6" cy="6" r="2.6" fill="var(--ramp-0)" />
      <circle cx="12" cy="18" r="2.6" fill="var(--ramp-2)" />
      <circle cx="18" cy="6" r="2.6" fill="var(--ramp-4)" />
    </svg>
  );
}
