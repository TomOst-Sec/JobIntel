"use client";

interface IntelligenceCardProps {
  type: "layoff" | "ipo" | "ghost" | "scaling" | "salary" | "market";
  title: string;
  body: string;
  score?: number;
  timestamp?: string;
  company?: string;
  cta?: { label: string; href: string };
}

const typeConfig: Record<
  IntelligenceCardProps["type"],
  { color: string; bg: string; label: string }
> = {
  layoff: { color: "var(--red)", bg: "var(--red-15)", label: "Layoff" },
  ipo: { color: "var(--gold)", bg: "var(--gold-15)", label: "IPO" },
  ghost: { color: "var(--red)", bg: "var(--red-15)", label: "Ghost" },
  scaling: { color: "var(--green)", bg: "var(--green-15)", label: "Scaling" },
  salary: { color: "var(--gold)", bg: "var(--gold-15)", label: "Salary" },
  market: { color: "var(--cyan)", bg: "var(--cyan-15)", label: "Market" },
};

function TypeIcon({ type }: { type: IntelligenceCardProps["type"] }) {
  const common = "w-4 h-4";
  switch (type) {
    case "layoff":
      return (
        <svg className={common} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2L14 13H2L8 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M8 6v3M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "ipo":
      return (
        <svg className={common} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 12l4-5 3 3 5-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 3h4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "ghost":
      return (
        <svg className={common} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 14V8a5 5 0 0110 0v6l-2-1.5-1.5 1.5L8 12.5 6.5 14 5 12.5 3 14z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <circle cx="6" cy="8" r="1" fill="currentColor" />
          <circle cx="10" cy="8" r="1" fill="currentColor" />
        </svg>
      );
    case "scaling":
      return (
        <svg className={common} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 13l4-4 2 2 4-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="3" cy="13" r="1.5" fill="currentColor" />
          <circle cx="13" cy="6" r="1.5" fill="currentColor" />
        </svg>
      );
    case "salary":
      return (
        <svg className={common} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 1v14M5 4h4.5a2.5 2.5 0 010 5H5M5 9h5a2.5 2.5 0 010 5H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "market":
      return (
        <svg className={common} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="7" width="3" height="7" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
          <rect x="6.5" y="4" width="3" height="10" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
          <rect x="12" y="2" width="3" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
  }
}

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return `${Math.floor(diffDay / 30)}mo ago`;
}

export function IntelligenceCard({
  type,
  title,
  body,
  score,
  timestamp,
  company,
  cta,
}: IntelligenceCardProps) {
  const cfg = typeConfig[type];

  return (
    <article
      className="relative rounded-lg p-4 transition-all duration-200 hover:translate-y-[-2px] group"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderLeft: `3px solid ${cfg.color}`,
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ backgroundColor: cfg.bg, color: cfg.color }}
        >
          <TypeIcon type={type} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded"
              style={{ backgroundColor: cfg.bg, color: cfg.color }}
            >
              {cfg.label}
            </span>
            {company && (
              <span
                className="text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                {company}
              </span>
            )}
            {timestamp && (
              <span
                className="text-xs ml-auto"
                style={{ color: "var(--text-muted)" }}
              >
                {relativeTime(timestamp)}
              </span>
            )}
          </div>

          <h3
            className="text-sm font-semibold mt-1.5 leading-snug"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </h3>

          <p
            className="text-sm mt-1 leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            {body}
          </p>

          {score !== undefined && (
            <span
              className="font-mono text-xs mt-2 inline-block"
              style={{ color: cfg.color }}
            >
              Score: {score}
            </span>
          )}

          {cta && (
            <a
              href={cta.href}
              className="inline-flex items-center gap-1 text-xs font-medium mt-3 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]"
              style={{ color: "var(--cyan)" }}
            >
              {cta.label}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default IntelligenceCard;
