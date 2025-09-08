"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface SalaryResult {
  job_title: string;
  location: string | null;
  experience: string;
  percentiles: { p25: number; p50: number; p75: number; p90: number };
  sample_size: number;
  top_paying_companies: { company: string; avg_salary: number; sample: number }[];
  market_comparison: { market: string; avg_salary: number; sample: number }[];
  ai_insight: string | null;
}

function formatSalary(n: number) {
  if (!n) return "$0";
  return "$" + n.toLocaleString();
}

const BAR_COLORS = [
  "var(--cyan)",
  "var(--cyan)",
  "var(--purple)",
  "var(--purple)",
];

export default function SalaryCheckPage() {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [experience, setExperience] = useState("mid");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SalaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    if (!title.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/v1/public/salary-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_title: title.trim(),
          location: location.trim() || null,
          experience,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: "Request failed" }));
        throw new Error(body.detail || "Failed to check salary");
      }

      setResult(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const maxSalary = result ? Math.max(result.percentiles.p90, 1) : 1;
  const cardStyle = { backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" };
  const inputStyle = {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-primary)",
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-void)" }}>
      {/* Nav */}
      <nav
        className="flex items-center justify-between px-8 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <Link href="/" className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          Job<span style={{ color: "var(--cyan)" }}>Intel</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/ghost-check" className="text-sm transition-colors" style={{ color: "var(--text-secondary)" }}>Ghost Check</Link>
          <Link href="/reports/weekly" className="text-sm transition-colors" style={{ color: "var(--text-secondary)" }}>Weekly Report</Link>
          <Link href="/login">
            <Button variant="secondary" size="sm">Log in</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-3xl mx-auto text-center py-16 px-4">
        <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
          Salary <span style={{ color: "var(--cyan)" }}>Intelligence</span>
        </h1>
        <p className="text-lg max-w-xl mx-auto mb-8" style={{ color: "var(--text-secondary)" }}>
          Know your worth. Get real salary data for any role, powered by live job market analysis.
        </p>

        {/* Input form */}
        <div className="max-w-2xl mx-auto space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCheck()}
            placeholder="Job title (e.g., Senior Software Engineer)"
            className="w-full px-4 py-3 rounded-lg outline-none transition-colors"
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--cyan)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
          />
          <div className="flex gap-3">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location (optional)"
              className="flex-1 px-4 py-3 rounded-lg outline-none transition-colors"
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--cyan)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
            />
            <select
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              className="px-4 py-3 rounded-lg outline-none"
              style={inputStyle}
            >
              <option value="entry">Entry Level</option>
              <option value="mid">Mid Level</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead / Staff</option>
              <option value="executive">Executive</option>
            </select>
            <Button size="lg" onClick={handleCheck} disabled={loading || !title.trim()}>
              {loading ? "Checking..." : "Check Salary"}
            </Button>
          </div>
        </div>
      </section>

      {/* Loading */}
      {loading && (
        <section className="max-w-3xl mx-auto px-4 pb-16">
          <div className="rounded-xl p-8 animate-pulse" style={cardStyle}>
            <div className="h-6 rounded w-1/3 mb-4" style={{ backgroundColor: "var(--bg-elevated)" }} />
            <div className="h-32 rounded mb-4" style={{ backgroundColor: "var(--bg-elevated)" }} />
            <div className="h-4 rounded w-2/3" style={{ backgroundColor: "var(--bg-elevated)" }} />
          </div>
        </section>
      )}

      {/* Error */}
      {error && (
        <section className="max-w-3xl mx-auto px-4 pb-16">
          <div className="rounded-xl p-6 text-center" style={{ backgroundColor: "var(--red-08)", border: "1px solid var(--red-15)" }}>
            <p style={{ color: "var(--red)" }}>{error}</p>
          </div>
        </section>
      )}

      {/* Results */}
      {result && !loading && (
        <section className="max-w-3xl mx-auto px-4 pb-16 space-y-6">
          {/* Percentile visualization */}
          <div className="rounded-xl p-8" style={cardStyle}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
                {result.job_title} {result.location && <span style={{ color: "var(--text-secondary)" }}>in {result.location}</span>}
              </h2>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>{result.sample_size} data points</span>
            </div>

            {result.sample_size === 0 ? (
              <p className="text-center py-8" style={{ color: "var(--text-secondary)" }}>
                Not enough data for this role. Try a broader job title.
              </p>
            ) : (
              <>
                {/* Salary range bars */}
                <div className="space-y-4 mb-8">
                  {[
                    { label: "25th Percentile", value: result.percentiles.p25 },
                    { label: "Median (50th)", value: result.percentiles.p50 },
                    { label: "75th Percentile", value: result.percentiles.p75 },
                    { label: "90th Percentile", value: result.percentiles.p90 },
                  ].map((bar, idx) => (
                    <div key={bar.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span style={{ color: "var(--text-secondary)" }}>{bar.label}</span>
                        <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{formatSalary(bar.value)}</span>
                      </div>
                      <div className="w-full h-3 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-elevated)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${(bar.value / maxSalary) * 100}%`, backgroundColor: BAR_COLORS[idx] }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* AI Insight */}
                {result.ai_insight && (
                  <div
                    className="rounded-lg p-4 mb-6"
                    style={{ backgroundColor: "var(--cyan-08)", border: "1px solid var(--cyan-15)" }}
                  >
                    <p className="text-sm font-semibold mb-1" style={{ color: "var(--cyan)" }}>AI Insight</p>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{result.ai_insight}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Top paying companies */}
          {result.top_paying_companies.length > 0 && (
            <div className="rounded-xl p-8" style={cardStyle}>
              <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Top Paying Companies</h3>
              <div className="space-y-3">
                {result.top_paying_companies.slice(0, 8).map((c, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm w-6" style={{ color: "var(--text-muted)" }}>{i + 1}.</span>
                      <span style={{ color: "var(--text-primary)" }}>{c.company}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold" style={{ color: "var(--green)" }}>{formatSalary(c.avg_salary)}</span>
                      <span className="text-sm ml-2" style={{ color: "var(--text-muted)" }}>({c.sample} roles)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Market comparison */}
          {result.market_comparison.length > 0 && (
            <div className="rounded-xl p-8" style={cardStyle}>
              <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Market Comparison</h3>
              <div className="space-y-3">
                {result.market_comparison.map((m, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span style={{ color: "var(--text-primary)" }}>{m.market}</span>
                    <div className="text-right">
                      <span className="font-semibold" style={{ color: "var(--cyan)" }}>{formatSalary(m.avg_salary)}</span>
                      <span className="text-sm ml-2" style={{ color: "var(--text-muted)" }}>({m.sample} roles)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="text-center pt-4">
            <p className="mb-3" style={{ color: "var(--text-secondary)" }}>Want personalized salary negotiation coaching?</p>
            <Link href="/signup">
              <Button size="lg">Sign Up Free</Button>
            </Link>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="py-8 text-center text-sm" style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
        <p>JobIntel &copy; 2026. AI-Powered Hiring Intelligence.</p>
      </footer>
    </div>
  );
}
