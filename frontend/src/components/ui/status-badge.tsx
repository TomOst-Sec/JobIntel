"use client";

interface StatusBadgeProps {
  status:
    | "saved"
    | "applied"
    | "phone_screen"
    | "interview"
    | "offer"
    | "rejected"
    | "withdrawn"
    | "accepted";
}

const statusConfig: Record<
  StatusBadgeProps["status"],
  { label: string; color: string; bg: string; icon: "circle-hollow" | "circle" | "pulse" | "star" | "x" | "check" }
> = {
  saved: {
    label: "Saved",
    color: "var(--text-muted)",
    bg: "rgba(58, 80, 112, 0.15)",
    icon: "circle-hollow",
  },
  applied: {
    label: "Applied",
    color: "var(--cyan)",
    bg: "var(--cyan-15)",
    icon: "circle",
  },
  phone_screen: {
    label: "Phone Screen",
    color: "var(--cyan)",
    bg: "var(--cyan-15)",
    icon: "circle",
  },
  interview: {
    label: "Interview",
    color: "var(--green)",
    bg: "var(--green-15)",
    icon: "pulse",
  },
  offer: {
    label: "Offer",
    color: "var(--gold)",
    bg: "var(--gold-15)",
    icon: "star",
  },
  rejected: {
    label: "Rejected",
    color: "var(--red)",
    bg: "var(--red-15)",
    icon: "x",
  },
  withdrawn: {
    label: "Withdrawn",
    color: "var(--text-muted)",
    bg: "rgba(58, 80, 112, 0.15)",
    icon: "x",
  },
  accepted: {
    label: "Accepted",
    color: "var(--green)",
    bg: "var(--green-15)",
    icon: "check",
  },
};

function StatusIcon({ type, color }: { type: string; color: string }) {
  switch (type) {
    case "circle-hollow":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <circle cx="5" cy="5" r="3.5" stroke={color} strokeWidth="1.5" />
        </svg>
      );
    case "circle":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <circle cx="5" cy="5" r="4" fill={color} />
        </svg>
      );
    case "pulse":
      return (
        <span className="relative inline-flex w-2.5 h-2.5" aria-hidden="true">
          <span
            className="absolute inline-flex h-full w-full rounded-full opacity-50 live-pulse"
            style={{ backgroundColor: color }}
          />
          <span
            className="relative inline-flex rounded-full w-2.5 h-2.5"
            style={{ backgroundColor: color }}
          />
        </span>
      );
    case "star":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path
            d="M5 1l1.18 2.39L8.5 3.77 7 5.73l.35 2.77L5 7.38 2.65 8.5 3 5.73 1.5 3.77l2.32-.38L5 1z"
            fill={color}
          />
        </svg>
      );
    case "x":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M3 3l4 4M7 3l-4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "check":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M2.5 5.5L4 7l3.5-4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = statusConfig[status];

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
      aria-label={`Status: ${cfg.label}`}
    >
      <StatusIcon type={cfg.icon} color={cfg.color} />
      {cfg.label}
    </span>
  );
}

export default StatusBadge;
