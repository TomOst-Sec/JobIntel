"use client";

import { useState } from "react";

interface BuildScoreProps {
  score: number;
  breakdown?: {
    consistency: number;
    quality: number;
    breadth: number;
    collaboration: number;
    impact: number;
  };
  size?: "sm" | "md" | "lg";
  showBreakdown?: boolean;
}

function getScoreTier(score: number) {
  if (score >= 85) return { label: "Elite", color: "#FEE440", glow: "rgba(254,228,64,0.3)" };
  if (score >= 70) return { label: "Strong", color: "#00F5D4", glow: "rgba(0,245,212,0.3)" };
  if (score >= 50) return { label: "Growing", color: "#00BBF9", glow: "rgba(0,187,249,0.3)" };
  if (score >= 30) return { label: "Building", color: "#9B5DE5", glow: "rgba(155,93,229,0.3)" };
  return { label: "Starting", color: "#666", glow: "rgba(100,100,100,0.2)" };
}

const sizeMap = {
  sm: { ring: 32, stroke: 3, fontSize: "10px", labelSize: "8px" },
  md: { ring: 48, stroke: 4, fontSize: "14px", labelSize: "10px" },
  lg: { ring: 72, stroke: 5, fontSize: "20px", labelSize: "12px" },
};

export function BuildScore({ score, breakdown, size = "md", showBreakdown = false }: BuildScoreProps) {
  const [expanded, setExpanded] = useState(false);
  const tier = getScoreTier(score);
  const s = sizeMap[size];
  const radius = (s.ring - s.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div
      className="inline-flex flex-col items-center"
      onClick={showBreakdown ? () => setExpanded(!expanded) : undefined}
      style={{ cursor: showBreakdown ? "pointer" : "default" }}
    >
      {/* Circular gauge */}
      <div className="relative" style={{ width: s.ring, height: s.ring }}>
        <svg width={s.ring} height={s.ring} className="transform -rotate-90">
          {/* Background ring */}
          <circle
            cx={s.ring / 2}
            cy={s.ring / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={s.stroke}
          />
          {/* Score ring */}
          <circle
            cx={s.ring / 2}
            cy={s.ring / 2}
            r={radius}
            fill="none"
            stroke={tier.color}
            strokeWidth={s.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 1s ease-out",
              filter: `drop-shadow(0 0 4px ${tier.glow})`,
            }}
          />
        </svg>
        {/* Score number */}
        <div
          className="absolute inset-0 flex items-center justify-center font-mono font-bold"
          style={{ fontSize: s.fontSize, color: tier.color }}
        >
          {Math.round(score)}
        </div>
      </div>

      {/* Label */}
      {size !== "sm" && (
        <span
          className="mt-0.5 font-semibold"
          style={{ fontSize: s.labelSize, color: tier.color, letterSpacing: "0.5px" }}
        >
          {tier.label}
        </span>
      )}

      {/* Breakdown popover */}
      {expanded && breakdown && (
        <div
          className="mt-2 p-3 rounded-lg"
          style={{
            background: "var(--bg-elevated, #1a1a2e)",
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
            minWidth: "160px",
          }}
        >
          {(["consistency", "quality", "breadth", "collaboration", "impact"] as const).map((key) => (
            <div key={key} className="flex items-center justify-between gap-3 py-1">
              <span className="text-xs capitalize" style={{ color: "var(--text-muted, #888)" }}>
                {key}
              </span>
              <div className="flex items-center gap-2">
                <div
                  className="h-1.5 rounded-full"
                  style={{
                    width: "60px",
                    background: "rgba(255,255,255,0.06)",
                  }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${breakdown[key]}%`,
                      background: tier.color,
                      transition: "width 0.5s ease-out",
                    }}
                  />
                </div>
                <span className="text-xs font-mono" style={{ color: "var(--text-secondary, #aaa)", minWidth: "24px", textAlign: "right" }}>
                  {Math.round(breakdown[key])}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default BuildScore;
