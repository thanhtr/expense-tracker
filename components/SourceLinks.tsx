'use client';

export interface SourceLink {
  label: string;
  url: string;
}

/** Renders a "Sources: ..." line of links. Each caller keeps its own {label,url} registry so the
 * claims stay next to the model that cites them; this only renders the links. */
export function SourceLinks({ sources }: { sources: SourceLink[] }) {
  return (
    <span className="block text-[11px] text-[var(--fg-3)]">
      Sources:{' '}
      {sources.map((s, i) => (
        <span key={s.url}>
          {i > 0 && ' · '}
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--fg-2)]">
            {s.label}
          </a>
        </span>
      ))}
    </span>
  );
}
