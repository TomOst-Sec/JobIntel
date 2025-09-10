"use client";

interface CompanyTrajBadgeProps {
  trajectory: "scaling" | "stable" | "contracting" | "risk";
  size?: "sm" | "md";
}

const config: Record<
  CompanyTrajBadgeProps["trajectory"],
  { label: string; color: string; bg: string; pulse: boolean }
> = {
  scaling: {
    label: "SCALING",
    color: "var(--green)",
    bg: "var(--green-15)",
    pulse: false,
  },
  stable: {
    label: "STABLE",
    color: "var(--cyan)",
    bg: "var(--cyan-15)",
    pulse: false,
  },
  contracting: {
    label: "CONTRACTING",
    color: "var(--gold)",
    bg: "var(--gold-15)",
    pulse: false,
  },
  risk: {
    label: "AT RISK",
    color: "var(--red)",
    bg: "var(--red-15)",
    pulse: true,
  },
};

function ArrowIcon({ trajectory }: { trajectory: CompanyTrajBadgeProps["trajectory"] }) {
  if (trajectory === "scaling") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M6 10V2M6 2L2 6M6 2L10 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (trajectory === "stable") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M2 6H10M10 6L7 3M10 6L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (trajectory === "contracting") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M6 2V10M6 10L2 6M6 10L10 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  // risk - warning triangle
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M5.134 1.866a1 1 0 011.732 0l3.866 6.7A1 1 0 019.866 10H2.134a1 1 0 01-.866-1.5l3.866-6.634z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6 4.5V6.5M6 8h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

const sizeStyles = {
  sm: "px-1.5 py-0.5 text-[10px] gap-1",
  md: "px-2 py-1 text-xs gap-1.5",
};

export function CompanyTrajBadge({ trajectory, size = "sm" }: CompanyTrajBadgeProps) {
  const cfg = config[trajectory];

  return (
    <span
      className={[
        "inline-flex items-center rounded font-semibold tracking-wider",
        sizeStyles[size],
        cfg.pulse ? "live-pulse" : "",
        "transition-all duration-200",
      ].join(" ")}
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
      aria-label={`Company trajectory: ${cfg.label}`}
    >
      <ArrowIcon trajectory={trajectory} />
      {cfg.label}
    </span>
  );
}

export default CompanyTrajBadge;
