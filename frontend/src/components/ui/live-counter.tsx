"use client";
import { useEffect, useRef, useState } from "react";

interface LiveCounterProps {
  value: number;
  label: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  prefix?: string;
  suffix?: string;
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function LiveCounter({
  value,
  label,
  trend,
  trendValue,
  prefix = "",
  suffix = "",
}: LiveCounterProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const [isPulsing, setIsPulsing] = useState(false);
  const prevValueRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const startValue = prevValueRef.current;
    const endValue = value;
    const duration = 1200;
    const startTime = performance.now();

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutExpo(progress);
      const current = Math.round(startValue + (endValue - startValue) * eased);
      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setIsPulsing(true);
        prevValueRef.current = endValue;
        setTimeout(() => setIsPulsing(false), 400);
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  const trendColor =
    trend === "up"
      ? "var(--green)"
      : trend === "down"
        ? "var(--red)"
        : "var(--cyan)";

  const trendArrow =
    trend === "up" ? "\u2191" : trend === "down" ? "\u2193" : "\u2192";

  const formattedValue = displayValue.toLocaleString();

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-1">
        {prefix && (
          <span
            className="font-display text-lg"
            style={{ color: "var(--text-secondary)" }}
          >
            {prefix}
          </span>
        )}
        <span
          className={`font-display text-3xl tabular-nums ${isPulsing ? "count-pulse" : ""}`}
          style={{ color: "var(--text-primary)" }}
        >
          {formattedValue}
        </span>
        {suffix && (
          <span
            className="font-display text-lg"
            style={{ color: "var(--text-secondary)" }}
          >
            {suffix}
          </span>
        )}
      </div>

      <span
        className="text-sm mt-1"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </span>

      {trend && trendValue && (
        <span
          className="font-mono text-xs mt-1 inline-flex items-center gap-1"
          style={{ color: trendColor }}
        >
          {trendArrow} {trendValue}
        </span>
      )}
    </div>
  );
}

export default LiveCounter;
