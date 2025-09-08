"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface GhostSignal {
  signal: string;
  weight: number;
  desc: string;
}

interface GhostResult {
  job_url: string;
  company: string | null;
  title: string | null;
  ghost_score: number;
  signals: GhostSignal[];
  verdict: string;
  confidence: string;
  source: string;
}

function getVerdictColor(verdict: string) {
  switch (verdict) {
    case "likely_ghost": return "var(--red)";
    case "suspicious": return "var(--gold)";
    case "likely_real": return "var(--green)";
    default: return "var(--text-muted)";
  }
}

function getVerdictLabel(verdict: string) {
  switch (verdict) {
    case "likely_ghost": return "Likely Ghost";
    case "suspicious": return "Suspicious";
    case "likely_real": return "Likely Real";
    case "unable_to_check": return "Unable to Check";
    default: return "Unknown";
  }
}

function getScoreColor(score: number) {
  if (score >= 50) return "var(--red)";
  if (score >= 25) return "var(--gold)";
  return "var(--green)";
}

export default function GhostCheckPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GhostResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/v1/public/ghost-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: "Request failed" }));
        throw new Error(body.detail || "Failed to check job posting");
      }

      const data: GhostResult = await res.json();
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const cardStyle = { backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" };

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
          <Link href="/salary-check" className="text-sm transition-colors" style={{ color: "var(--text-secondary)" }}>Salary Check</Link>
          <Link href="/reports/weekly" className="text-sm transition-colors" style={{ color: "var(--text-secondary)" }}>Weekly Report</Link>
          <Link href="/login">
            <Button variant="secondary" size="sm">Log in</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-3xl mx-auto text-center py-16 px-4">
        <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
          Ghost Job <span style={{ color: "var(--cyan)" }}>Checker</span>
        </h1>
        <p className="text-lg max-w-xl mx-auto mb-8" style={{ color: "var(--text-secondary)" }}>
          Is that job posting real? Paste any job URL and our AI will analyze it for ghost job signals.
        </p>

        {/* Input */}
        <div className="flex gap-3 max-w-2xl mx-auto">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCheck()}
            placeholder="Paste a job posting URL..."
            className="flex-1 px-4 py-3 rounded-lg outline-none transition-colors"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--cyan)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
          />
          <Button size="lg" onClick={handleCheck} disabled={loading || !url.trim()}>
            {loading ? "Checking..." : "Check Now"}
          </Button>
        </div>
      </section>

      {/* Loading skeleton */}
      {loading && (
        <section className="max-w-2xl mx-auto px-4 pb-16">
          <div className="rounded-xl p-8 animate-pulse" style={cardStyle}>
            <div className="h-6 rounded w-1/3 mb-4" style={{ backgroundColor: "var(--bg-elevated)" }} />
            <div className="h-24 rounded mb-4" style={{ backgroundColor: "var(--bg-elevated)" }} />
            <div className="h-4 rounded w-2/3" style={{ backgroundColor: "var(--bg-elevated)" }} />
          </div>
        </section>
      )}

      {/* Error */}
      {error && (
        <section className="max-w-2xl mx-auto px-4 pb-16">
          <div className="rounded-xl p-6 text-center" style={{ backgroundColor: "var(--red-08)", border: "1px solid var(--red-15)" }}>
            <p style={{ color: "var(--red)" }}>{error}</p>
          </div>
        </section>
      )}

      {/* Results */}
      {result && !loading && (
        <section className="max-w-2xl mx-auto px-4 pb-16">
          <div className="rounded-xl p-8" style={cardStyle}>
            {/* Header */}
            {result.title && (
              <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{result.title}</h2>
            )}
            {result.company && (
              <p className="mb-6" style={{ color: "var(--text-secondary)" }}>{result.company}</p>
            )}

            {/* Score Gauge */}
            <div className="flex items-center gap-6 mb-8">
              <div className="relative w-24 h-24">
                <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-elevated)" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke={getScoreColor(result.ghost_score)}
                    strokeWidth="8"
                    strokeDasharray={`${result.ghost_score * 2.64} 264`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{Math.round(result.ghost_score)}</span>
                </div>
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: getVerdictColor(result.verdict) }}>
                  {getVerdictLabel(result.verdict)}
                </p>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Ghost Score: {result.ghost_score}/100</p>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Confidence: {result.confidence}</p>
              </div>
            </div>

            {/* Signals */}
            {result.signals.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-secondary)" }}>
                  Detected Signals
                </h3>
                <div className="space-y-2">
                  {result.signals.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-lg p-3"
                      style={{ backgroundColor: "var(--bg-elevated)" }}
                    >
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getScoreColor(s.weight * 100) }} />
                      <div>
                        <p className="text-sm" style={{ color: "var(--text-primary)" }}>{s.desc}</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Weight: {(s.weight * 100).toFixed(0)}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Share + CTA */}
            <div
              className="flex items-center justify-between pt-4"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <button
                onClick={() => navigator.clipboard.writeText(window.location.href)}
                className="text-sm transition-colors"
                style={{ color: "var(--cyan)" }}
              >
                Copy link to share
              </button>
              <Link href="/signup">
                <Button variant="secondary" size="sm">Want deeper analysis? Sign up free</Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-4 py-16" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <h2 className="text-2xl font-bold text-center mb-12" style={{ color: "var(--text-primary)" }}>How Ghost Detection Works</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { step: "1", title: "Paste URL", desc: "Enter any job posting URL from LinkedIn, Indeed, Greenhouse, or any other job board." },
            { step: "2", title: "AI Analysis", desc: "Our AI checks 10+ ghost signals: repost frequency, salary transparency, requirement quality, and more." },
            { step: "3", title: "Get Verdict", desc: "Receive a ghost score (0-100) with detailed signal breakdown and confidence level." },
          ].map((item) => (
            <div key={item.step} className="rounded-xl p-6 text-center" style={cardStyle}>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold"
                style={{ backgroundColor: "var(--cyan-15)", color: "var(--cyan)" }}
              >
                {item.step}
              </div>
              <h3 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>{item.title}</h3>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-sm" style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
        <p>JobIntel &copy; 2026. AI-Powered Hiring Intelligence.</p>
      </footer>
    </div>
  );
}
