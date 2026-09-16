/**
 * A stored time, printed the same way on every page.
 *
 * Fixed to UTC rather than the reader's zone. These render on the server, which
 * does not have theirs, and a component that guessed would disagree with the
 * one next to it. The exact instant is in the tooltip for anyone who needs it.
 */

const WHEN = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function Timestamp({ at }: { at: Date }) {
  const iso = at.toISOString();
  return (
    <time
      dateTime={iso}
      title={iso}
      className="whitespace-nowrap tabular-nums text-zinc-600 dark:text-zinc-400"
    >
      {WHEN.format(at)}
    </time>
  );
}
