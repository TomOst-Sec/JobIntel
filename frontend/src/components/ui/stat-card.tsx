"use client";

interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  trend?: "up" | "down" | "neutral";
  icon?: React.ReactNode;
}

export function StatCard({ label, value, sublabel, trend, icon }: StatCardProps) {
  const trendColor =
    trend === "up"
      ? "var(--green)"
      : trend === "down"
        ? "var(--red)"
        : "var(--text-secondary)";

  const trendArrow =
    trend === "up" ? "\u2191" : trend === "down" ? "\u2193" : "\u2192";

  return (
    <div
      className="card p-6 relative overflow-hidden group"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p
            className="text-sm mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            {label}
          </p>
          <p
            className="font-display text-3xl"
            style={{ color: "var(--text-primary)" }}
          >
            {value}
          </p>
          {sublabel && (
            <p className="text-xs mt-2 inline-flex items-center gap-1">
              {trend && (
                <span className="font-mono" style={{ color: trendColor }}>
                  {trendArrow}
                </span>
              )}
              <span style={{ color: trendColor }}>{sublabel}</span>
            </p>
          )}
        </div>
        {icon && (
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{
              backgroundColor: "var(--cyan-08)",
              color: "var(--cyan)",
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

export default StatCard;
