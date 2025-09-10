"use client";
import { useState } from "react";

interface SalaryRangeProps {
  min?: number | null;
  max?: number | null;
  currency?: string;
  marketMin?: number | null;
  marketMax?: number | null;
  showMarketComparison?: boolean;
}

function formatSalary(amount: number, currency: string = "USD"): string {
  const symbol = currency === "USD" ? "$" : currency === "GBP" ? "\u00A3" : currency === "EUR" ? "\u20AC" : currency + " ";
  if (amount >= 1_000_000) {
    const val = amount / 1_000_000;
    return `${symbol}${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}M`;
  }
  if (amount >= 1000) {
    const val = amount / 1000;
    return `${symbol}${val % 1 === 0 ? val.toFixed(0) : val.toFixed(0)}K`;
  }
  return `${symbol}${amount}`;
}

function computeMarketDiff(
  salaryMin: number | null | undefined,
  salaryMax: number | null | undefined,
  marketMin: number | null | undefined,
  marketMax: number | null | undefined
): { percent: number; direction: "above" | "below" } | null {
  const salMid = salaryMin && salaryMax ? (salaryMin + salaryMax) / 2 : salaryMin || salaryMax;
  const mktMid = marketMin && marketMax ? (marketMin + marketMax) / 2 : marketMin || marketMax;
  if (!salMid || !mktMid || mktMid === 0) return null;
  const diff = ((salMid - mktMid) / mktMid) * 100;
  return { percent: Math.abs(Math.round(diff)), direction: diff >= 0 ? "above" : "below" };
}

export function SalaryRange({
  min,
  max,
  currency = "USD",
  marketMin,
  marketMax,
  showMarketComparison = false,
}: SalaryRangeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const hasSalary = (min != null && min > 0) || (max != null && max > 0);
  const hasMarket = (marketMin != null && marketMin > 0) || (marketMax != null && marketMax > 0);

  if (hasSalary) {
    const minStr = min != null && min > 0 ? formatSalary(min, currency) : null;
    const maxStr = max != null && max > 0 ? formatSalary(max, currency) : null;
    const rangeStr = minStr && maxStr ? `${minStr}\u2013${maxStr}` : minStr || maxStr;

    const marketDiff =
      showMarketComparison && hasMarket
        ? computeMarketDiff(min, max, marketMin, marketMax)
        : null;

    return (
      <div className="inline-flex flex-col">
        <span
          className="font-mono font-bold"
          style={{ color: "var(--green)" }}
        >
          {rangeStr}
        </span>
        {marketDiff && (
          <span
            className="font-mono text-xs mt-0.5"
            style={{
              color: marketDiff.direction === "below" ? "var(--red)" : "var(--green)",
            }}
          >
            {marketDiff.direction === "below" ? "\u2193" : "\u2191"} {marketDiff.percent}%{" "}
            {marketDiff.direction} market
          </span>
        )}
      </div>
    );
  }

  if (hasMarket) {
    const mktMinStr = marketMin != null && marketMin > 0 ? formatSalary(marketMin, currency) : null;
    const mktMaxStr = marketMax != null && marketMax > 0 ? formatSalary(marketMax, currency) : null;
    const mktRange = mktMinStr && mktMaxStr ? `${mktMinStr}\u2013${mktMaxStr}` : mktMinStr || mktMaxStr;

    return (
      <div className="inline-flex items-center gap-1 relative">
        <span
          className="font-mono text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          Market rate: {mktRange}
        </span>
        <button
          type="button"
          className="inline-flex items-center justify-center w-4 h-4 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]"
          style={{
            backgroundColor: "var(--cyan-08)",
            color: "var(--text-secondary)",
          }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onFocus={() => setShowTooltip(true)}
          onBlur={() => setShowTooltip(false)}
          aria-label="Salary information"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path
              d="M5 4.5V7M5 3h.005"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {showTooltip && (
          <div
            className="absolute bottom-full left-0 mb-2 px-3 py-2 rounded-lg text-xs z-50 whitespace-nowrap animate-fade-up"
            style={{
              backgroundColor: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
            }}
            role="tooltip"
          >
            Estimated from market data. Employer has not disclosed salary.
          </div>
        )}
      </div>
    );
  }

  return (
    <span
      className="font-mono text-sm"
      style={{ color: "var(--text-muted)" }}
    >
      Salary not disclosed
    </span>
  );
}

export default SalaryRange;
