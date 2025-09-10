"use client";
import { useState } from "react";

interface GhostScoreProps {
  score: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  showEvidence?: boolean;
  signals?: { signal: string; weight: number; desc: string }[];
}

function getScoreTier(score: number) {
  if (score < 25) {
    return {
      label: "Likely Real",
      color: "var(--green)",
      bg: "var(--green-15)",
      dot: "var(--green)",
      pulse: false,
    };
  }
  if (score < 50) {
    return {
      label: "Verify First",
      color: "var(--gold)",
      bg: "var(--gold-15)",
      dot: "var(--gold)",
      pulse: false,
    };
  }
  if (score < 75) {
    return {
      label: "Suspicious",
      color: "#ff8800",
      bg: "rgba(255, 136, 0, 0.15)",
      dot: "#ff8800",
      pulse: false,
    };
  }
  return {
    label: "Ghost Risk",
    color: "var(--red)",
    bg: "var(--red-15)",
    dot: "var(--red)",
    pulse: true,
  };
}

const sizeStyles = {
  sm: { pill: "px-2 py-0.5 text-xs gap-1.5", score: "text-xs", dot: "w-1.5 h-1.5" },
  md: { pill: "px-3 py-1 text-sm gap-2", score: "text-sm", dot: "w-2 h-2" },
  lg: { pill: "px-4 py-1.5 text-base gap-2.5", score: "text-base", dot: "w-2.5 h-2.5" },
};

export function GhostScore({
  score,
  showLabel = true,
  size = "md",
  showEvidence = false,
  signals,
}: GhostScoreProps) {
  const [expanded, setExpanded] = useState(false);
  const tier = getScoreTier(score);
  const styles = sizeStyles[size];
  const canExpand = showEvidence && signals && signals.length > 0;

  return (
    <div className="inline-flex flex-col">
      <button
        type="button"
        onClick={canExpand ? () => setExpanded((e) => !e) : undefined}
        className={[
          "inline-flex items-center rounded-full font-medium",
          styles.pill,
          canExpand ? "cursor-pointer hover:brightness-110" : "cursor-default",
          "transition-all duration-200",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]",
        ].join(" ")}
        style={{ backgroundColor: tier.bg, color: tier.color }}
        aria-expanded={canExpand ? expanded : undefined}
        aria-label={`Ghost score: ${score}. ${tier.label}`}
      >
        <span
          className={`${styles.dot} rounded-full shrink-0 ${tier.pulse ? "live-pulse" : ""}`}
          style={{ backgroundColor: tier.dot }}
          aria-hidden="true"
        />
        <span className={`font-mono ${styles.score}`}>{score}</span>
        {showLabel && <span>{tier.label}</span>}
        {canExpand && (
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {expanded && signals && (
        <div
          className="mt-2 rounded-lg p-3 space-y-2 animate-fade-up"
          style={{
            backgroundColor: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <p
            className="text-xs font-medium mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Evidence Signals
          </p>
          {signals.map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-xs font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {s.signal}
                  </span>
                  <span
                    className="font-mono text-xs shrink-0"
                    style={{ color: tier.color }}
                  >
                    +{s.weight}
                  </span>
                </div>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  {s.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default GhostScore;
