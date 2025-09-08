"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LiveCounter } from "@/components/ui/live-counter";

/* ── Types ─────────────────────────────────────────────────── */

interface JobStats {
  total_jobs: number;
  unique_companies: number;
  markets: number;
  with_salary: number;
}

interface GhostStats {
  total_analyzed: number;
  likely_ghost: number;
  suspicious: number;
  likely_real: number;
}

/* ── Inline SVG Icons ──────────────────────────────────────── */

function IconGhost({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C7.58 2 4 5.58 4 10v10.5c0 .83 1 1.25 1.59.66l1.41-1.41 1.41 1.41a1 1 0 001.42 0L11.24 20l1.41 1.41a1 1 0 001.42 0L15.48 20l1.41 1.41c.59.59 1.59.17 1.59-.66V10c0-4.42-3.58-8-8-8z" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
      <circle cx="15" cy="10" r="1.5" fill="currentColor" />
    </svg>
  );
}

function IconDollar({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  );
}

function IconChart({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 16l4-8 4 4 5-9" />
    </svg>
  );
}

function IconWarning({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconChat({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      <line x1="8" y1="9" x2="16" y2="9" />
      <line x1="8" y1="13" x2="13" y2="13" />
    </svg>
  );
}

function IconBell({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

function IconCheck({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconX({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconArrowRight({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function IconMail({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 7L2 7" />
    </svg>
  );
}

/* ── Main Page ─────────────────────────────────────────────── */

export default function LandingPage() {
  const [stats, setStats] = useState<JobStats | null>(null);
  const [ghostStats, setGhostStats] = useState<GhostStats | null>(null);

  useEffect(() => {
    fetch("/api/v1/jobs/stats")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { if (data && typeof data.total_jobs === "number") setStats(data); })
      .catch(() => {});

    fetch("/api/v1/intelligence/ghost/stats")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { if (data && typeof data.total_analyzed === "number") setGhostStats(data); })
      .catch(() => {});
  }, []);

  const ghostPercent =
    ghostStats && ghostStats.total_analyzed > 0
      ? Math.round(
          ((ghostStats.likely_ghost + ghostStats.suspicious) /
            ghostStats.total_analyzed) *
            100
        )
      : null;

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--bg-void)", color: "var(--text-primary)" }}
    >
      {/* ════════════════════════════════════════════════════════
          Section 1: Navigation Bar
          ════════════════════════════════════════════════════════ */}
      <nav
        className="glass sticky top-0 z-50 flex items-center justify-between px-6 md:px-10 py-3"
      >
        <Link href="/" className="font-display text-xl tracking-tight">
          JOB<span style={{ color: "var(--cyan)" }}>INTEL</span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/pricing"
            className="hidden sm:inline-block text-sm px-3 py-1.5 transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--text-primary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--text-secondary)")
            }
          >
            Pricing
          </Link>
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Sign In
            </Button>
          </Link>
          <Link href="/signup">
            <Button variant="primary" size="sm">
              Try Free
            </Button>
          </Link>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════════════
          Section 2: Hero Section
          ════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0 bg-grid" />
        <div className="absolute inset-0 ambient-glow" />

        <div className="relative max-w-5xl mx-auto text-center pt-20 pb-16 px-4 md:pt-28 md:pb-20">
          <h1
            className="font-display text-5xl md:text-7xl lg:text-8xl leading-[1.08] mb-6 animate-fade-up"
          >
            See Through the
            <br />
            <span
              style={{
                color: "var(--cyan)",
                textShadow: "0 0 40px rgba(0, 212, 255, 0.4), 0 0 80px rgba(0, 212, 255, 0.15)",
              }}
            >
              Hiring Market
            </span>
          </h1>

          <p
            className="text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-up"
            style={{
              color: "var(--text-secondary)",
              animationDelay: "0.1s",
              animationFillMode: "both",
            }}
          >
            AI-powered intelligence that reveals ghost jobs, predicts layoffs,
            tracks salary trends, and gives you an unfair advantage in your job
            search.
          </p>

          {/* CTA buttons */}
          <div
            className="flex flex-col sm:flex-row gap-4 justify-center mb-16 animate-fade-up"
            style={{ animationDelay: "0.2s", animationFillMode: "both" }}
          >
            <Link href="/signup">
              <Button
                variant="primary"
                size="lg"
                className="w-full sm:w-auto"
                style={{
                  boxShadow:
                    "0 0 30px var(--cyan-15), 0 0 60px rgba(0, 212, 255, 0.08)",
                }}
              >
                Start Free
              </Button>
            </Link>
            <Link href="/demo">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                View Live Demo
              </Button>
            </Link>
          </div>

          {/* Floating stats */}
          {stats && (
            <div
              className="animate-fade-up grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 max-w-3xl mx-auto"
              style={{ animationDelay: "0.35s", animationFillMode: "both" }}
            >
              <LiveCounter
                value={stats.total_jobs}
                label="Jobs Analyzed"
                trend="up"
                trendValue="live"
              />
              <LiveCounter
                value={stats.unique_companies}
                label="Companies Tracked"
                trend="up"
                trendValue="growing"
              />
              <LiveCounter
                value={stats.markets}
                label="Markets"
              />
              {ghostStats ? (
                <LiveCounter
                  value={ghostStats.likely_ghost + ghostStats.suspicious}
                  label="Ghost Jobs Detected"
                  trend="up"
                  trendValue="flagged"
                />
              ) : (
                <LiveCounter value={0} label="Ghost Jobs Detected" />
              )}
            </div>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          Section 3: Live Intelligence Ticker
          ════════════════════════════════════════════════════════ */}
      {stats && (
        <section
          className="glass overflow-hidden py-3"
          style={{ borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="ticker-scroll flex whitespace-nowrap">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-8 px-4 font-mono text-sm shrink-0">
                <span style={{ color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--cyan)" }}>
                    {stats.total_jobs.toLocaleString()}
                  </span>{" "}
                  jobs tracked across{" "}
                  <span style={{ color: "var(--cyan)" }}>
                    {stats.unique_companies.toLocaleString()}
                  </span>{" "}
                  companies in{" "}
                  <span style={{ color: "var(--cyan)" }}>
                    {stats.markets}
                  </span>{" "}
                  markets
                </span>

                <span
                  className="inline-block w-1 h-1 rounded-full live-pulse"
                  style={{ background: "var(--cyan)" }}
                />

                {ghostPercent !== null && (
                  <span style={{ color: "var(--text-secondary)" }}>
                    <span style={{ color: "var(--red)" }}>{ghostPercent}%</span>{" "}
                    of jobs flagged as suspicious
                  </span>
                )}

                <span
                  className="inline-block w-1 h-1 rounded-full live-pulse"
                  style={{ background: "var(--green)" }}
                />

                <span style={{ color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--green)" }}>
                    {stats.with_salary?.toLocaleString() ?? "---"}
                  </span>{" "}
                  jobs with salary data
                </span>

                <span
                  className="inline-block w-1 h-1 rounded-full live-pulse"
                  style={{ background: "var(--gold)" }}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════
          Section 4: The Problem / Why JobIntel
          ════════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto py-20 md:py-28 px-4">
        <h2
          className="font-display text-3xl md:text-4xl text-center mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          The Job Market is Broken
        </h2>
        <p
          className="text-center mb-14 max-w-xl mx-auto"
          style={{ color: "var(--text-secondary)" }}
        >
          Millions of job seekers waste time on listings that were never real.
          JobIntel gives you clarity.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Ghost Jobs */}
          <div
            className="card p-6"
            style={{ borderLeft: "3px solid var(--red)" }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
              style={{ background: "var(--red-15)", color: "var(--red)" }}
            >
              <IconGhost />
            </div>
            <h3
              className="font-display text-lg mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              Ghost Jobs
            </h3>
            <p
              className="font-mono text-2xl mb-2"
              style={{ color: "var(--red)" }}
            >
              40%
              <span
                className="text-sm ml-1"
                style={{ color: "var(--text-muted)" }}
              >
                of listings are fake
              </span>
            </p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Companies post jobs they never intend to fill -- to look like
              they are growing, collect resumes, or appease internal politics.
            </p>
          </div>

          {/* Hidden Salaries */}
          <div
            className="card p-6"
            style={{ borderLeft: "3px solid var(--gold)" }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
              style={{ background: "var(--gold-15)", color: "var(--gold)" }}
            >
              <IconDollar />
            </div>
            <h3
              className="font-display text-lg mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              Hidden Salaries
            </h3>
            <p
              className="font-mono text-2xl mb-2"
              style={{ color: "var(--gold)" }}
            >
              65%
              <span
                className="text-sm ml-1"
                style={{ color: "var(--text-muted)" }}
              >
                hide compensation
              </span>
            </p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Most job postings deliberately omit salary ranges, forcing
              candidates to negotiate blind and accept lower offers.
            </p>
          </div>

          {/* Information Gap */}
          <div
            className="card p-6"
            style={{ borderLeft: "3px solid var(--cyan)" }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
              style={{ background: "var(--cyan-15)", color: "var(--cyan)" }}
            >
              <IconChart />
            </div>
            <h3
              className="font-display text-lg mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              Information Gap
            </h3>
            <p
              className="font-mono text-2xl mb-2"
              style={{ color: "var(--cyan)" }}
            >
              Recruiters
              <span
                className="text-sm ml-1"
                style={{ color: "var(--text-muted)" }}
              >
                know more than you
              </span>
            </p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Recruiters have market data, salary benchmarks, and hiring
              insights. You are flying blind. We level the playing field.
            </p>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          Section 5: Features Grid (How It Works)
          ════════════════════════════════════════════════════════ */}
      <section
        className="py-20 md:py-28 px-4"
        style={{ background: "var(--bg-base, var(--bg-deep))" }}
      >
        <div className="max-w-6xl mx-auto">
          <h2
            className="font-display text-3xl md:text-4xl text-center mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            Intelligence at Every Step
          </h2>
          <p
            className="text-center mb-14 max-w-xl mx-auto"
            style={{ color: "var(--text-secondary)" }}
          >
            Six powerful modules that transform how you navigate the job market.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(
              [
                {
                  icon: <IconGhost />,
                  title: "Ghost Job Detection",
                  desc: "Detect fake listings with 10+ signals. Every job gets a ghost score from 0-100 so you never waste time on dead-end applications.",
                  color: "var(--red)",
                  bg: "var(--red-15)",
                },
                {
                  icon: <IconDollar />,
                  title: "Salary Intelligence",
                  desc: "Real salary data from live job postings, not outdated estimates. Know your worth at any company, in any market.",
                  color: "var(--green)",
                  bg: "var(--green-15)",
                },
                {
                  icon: <IconWarning />,
                  title: "Layoff Radar",
                  desc: "Predict layoffs before they happen by analyzing hiring freezes, role removals, and Glassdoor sentiment shifts.",
                  color: "var(--gold)",
                  bg: "var(--gold-15)",
                },
                {
                  icon: <IconChart />,
                  title: "IPO Watch",
                  desc: "Detect pre-IPO hiring patterns -- finance, legal, compliance surges -- for early career moves at high-growth companies.",
                  color: "var(--gold)",
                  bg: "var(--gold-15)",
                },
                {
                  icon: <IconChat />,
                  title: "AI Career Coach",
                  desc: "Personalized negotiation coaching powered by real market data. Get counter-offer strategies backed by numbers.",
                  color: "var(--cyan)",
                  bg: "var(--cyan-15)",
                },
                {
                  icon: <IconBell />,
                  title: "Smart Alerts",
                  desc: "Set conditions and get notified when companies match your criteria. Never miss a window of opportunity.",
                  color: "var(--purple)",
                  bg: "var(--purple-15)",
                },
              ] as const
            ).map((f) => (
              <div
                key={f.title}
                className="card p-6 group cursor-default"
                style={{
                  borderTop: `3px solid ${f.color}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = `var(--shadow-card), 0 0 40px ${f.color}20`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "";
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                  style={{ background: f.bg, color: f.color }}
                >
                  {f.icon}
                </div>
                <h3
                  className="font-display text-lg mb-2"
                  style={{ color: "var(--text-primary)" }}
                >
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          Section 6: Comparison Table
          ════════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto py-20 md:py-28 px-4">
        <h2
          className="font-display text-3xl md:text-4xl text-center mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          JobIntel vs. LinkedIn vs. Glassdoor
        </h2>
        <p
          className="text-center mb-14 max-w-xl mx-auto"
          style={{ color: "var(--text-secondary)" }}
        >
          See why job seekers are switching to intelligence-first tools.
        </p>

        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full min-w-[540px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th
                  className="text-left text-sm font-medium py-3 px-4"
                  style={{ color: "var(--text-muted)" }}
                >
                  Feature
                </th>
                <th
                  className="text-center text-sm font-display py-3 px-4 rounded-t-lg"
                  style={{
                    color: "var(--cyan)",
                    background: "var(--cyan-08)",
                    borderTop: "2px solid var(--cyan)",
                    borderLeft: "1px solid var(--cyan-15)",
                    borderRight: "1px solid var(--cyan-15)",
                  }}
                >
                  JobIntel
                </th>
                <th
                  className="text-center text-sm font-medium py-3 px-4"
                  style={{ color: "var(--text-secondary)" }}
                >
                  LinkedIn
                </th>
                <th
                  className="text-center text-sm font-medium py-3 px-4"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Glassdoor
                </th>
              </tr>
            </thead>
            <tbody>
              {([
                { feature: "Ghost Detection",     ji: true,  li: false, gd: false },
                { feature: "Salary Data",          ji: true,  li: false, gd: true  },
                { feature: "AI Chat",              ji: true,  li: false, gd: false },
                { feature: "Layoff Prediction",    ji: true,  li: false, gd: false },
                { feature: "Company Intel",        ji: true,  li: true,  gd: true  },
                { feature: "Negotiation Coach",    ji: true,  li: false, gd: false },
                { feature: "Application Tracker",  ji: true,  li: true,  gd: false },
              ] as const).map((row, idx) => (
                <tr
                  key={row.feature}
                  style={{
                    background: idx % 2 === 0 ? "var(--bg-surface)" : "transparent",
                  }}
                >
                  <td
                    className="py-3 px-4 text-sm"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {row.feature}
                  </td>
                  <td
                    className="py-3 px-4 text-center"
                    style={{
                      borderLeft: "1px solid var(--cyan-15)",
                      borderRight: "1px solid var(--cyan-15)",
                      background:
                        idx % 2 === 0 ? "var(--cyan-08)" : "rgba(0,212,255,0.03)",
                    }}
                  >
                    <span className="inline-flex justify-center" style={{ color: "var(--green)" }}>
                      <IconCheck />
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {row.li ? (
                      <span className="inline-flex justify-center" style={{ color: "var(--green)" }}>
                        <IconCheck />
                      </span>
                    ) : (
                      <span className="inline-flex justify-center" style={{ color: "var(--red)" }}>
                        <IconX />
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {row.gd ? (
                      <span className="inline-flex justify-center" style={{ color: "var(--green)" }}>
                        <IconCheck />
                      </span>
                    ) : (
                      <span className="inline-flex justify-center" style={{ color: "var(--red)" }}>
                        <IconX />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {/* Bottom border for JobIntel column */}
              <tr>
                <td />
                <td
                  className="rounded-b-lg h-1"
                  style={{
                    borderLeft: "1px solid var(--cyan-15)",
                    borderRight: "1px solid var(--cyan-15)",
                    borderBottom: "2px solid var(--cyan)",
                    background: "var(--cyan-08)",
                  }}
                />
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          Section 7: Free Tools (Viral)
          ════════════════════════════════════════════════════════ */}
      <section
        className="py-20 md:py-28 px-4"
        style={{ background: "var(--bg-base, var(--bg-deep))" }}
      >
        <div className="max-w-6xl mx-auto">
          <h2
            className="font-display text-3xl md:text-4xl text-center mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            Free Tools — No Account Required
          </h2>
          <p
            className="text-center mb-14 max-w-xl mx-auto"
            style={{ color: "var(--text-secondary)" }}
          >
            Try our most popular features right now, completely free.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Ghost Job Checker */}
            <Link
              href="/ghost-check"
              className="card p-8 group transition-all duration-200"
              style={{ borderColor: "var(--border-subtle)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--red)";
                e.currentTarget.style.boxShadow = "var(--shadow-card), var(--shadow-glow-red)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-subtle)";
                e.currentTarget.style.boxShadow = "";
              }}
            >
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center mb-5"
                style={{ background: "var(--red-15)", color: "var(--red)" }}
              >
                <IconGhost className="w-7 h-7" />
              </div>
              <h3
                className="font-display text-xl mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                Ghost Job Checker
              </h3>
              <p className="text-sm mb-5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Is that job posting real? Paste any URL and our AI analyzes 10+
                ghost signals to give you a confidence score.
              </p>
              <span
                className="inline-flex items-center gap-1.5 text-sm font-medium"
                style={{ color: "var(--red)" }}
              >
                Check a job <IconArrowRight />
              </span>
            </Link>

            {/* Salary Intelligence */}
            <Link
              href="/salary-check"
              className="card p-8 group transition-all duration-200"
              style={{ borderColor: "var(--border-subtle)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--green)";
                e.currentTarget.style.boxShadow = "var(--shadow-card), var(--shadow-glow-green)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-subtle)";
                e.currentTarget.style.boxShadow = "";
              }}
            >
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center mb-5"
                style={{ background: "var(--green-15)", color: "var(--green)" }}
              >
                <IconDollar className="w-7 h-7" />
              </div>
              <h3
                className="font-display text-xl mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                Salary Intelligence
              </h3>
              <p className="text-sm mb-5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Know your worth. Get real salary percentiles for any role in any
                market from live job data, not crowdsourced guesses.
              </p>
              <span
                className="inline-flex items-center gap-1.5 text-sm font-medium"
                style={{ color: "var(--green)" }}
              >
                Check salary <IconArrowRight />
              </span>
            </Link>

            {/* Weekly Report */}
            <Link
              href="/reports/weekly"
              className="card p-8 group transition-all duration-200"
              style={{ borderColor: "var(--border-subtle)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--purple)";
                e.currentTarget.style.boxShadow = "var(--shadow-card), 0 0 40px rgba(139, 92, 246, 0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-subtle)";
                e.currentTarget.style.boxShadow = "";
              }}
            >
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center mb-5"
                style={{ background: "var(--purple-15)", color: "var(--purple)" }}
              >
                <IconMail className="w-7 h-7" />
              </div>
              <h3
                className="font-display text-xl mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                Weekly Report
              </h3>
              <p className="text-sm mb-5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                AI-powered market intelligence delivered weekly. Which companies
                are scaling, who is in trouble, and where the opportunities are.
              </p>
              <span
                className="inline-flex items-center gap-1.5 text-sm font-medium"
                style={{ color: "var(--purple)" }}
              >
                Read report <IconArrowRight />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          Section 8: CTA / Closing
          ════════════════════════════════════════════════════════ */}
      <section
        className="py-20 md:py-28 text-center px-4"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,212,255,0.06) 0%, transparent 100%)",
        }}
      >
        <h2
          className="font-display text-3xl md:text-5xl mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          Stop guessing. Start knowing.
        </h2>
        <p
          className="text-lg mb-10 max-w-lg mx-auto"
          style={{ color: "var(--text-secondary)" }}
        >
          Join thousands of professionals using AI-powered hiring intelligence.
        </p>
        <Link href="/signup">
          <Button
            variant="primary"
            size="lg"
            style={{
              boxShadow:
                "0 0 30px var(--cyan-15), 0 0 60px rgba(0,212,255,0.08)",
            }}
          >
            Create Free Account
          </Button>
        </Link>
        <p
          className="mt-4 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          No credit card required
        </p>
      </section>

      {/* ════════════════════════════════════════════════════════
          Section 9: Footer
          ════════════════════════════════════════════════════════ */}
      <footer
        className="py-8 px-6 md:px-10"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="font-display text-sm tracking-tight">
            JOB<span style={{ color: "var(--cyan)" }}>INTEL</span>
          </span>

          <div className="flex items-center gap-6">
            {[
              { label: "Pricing", href: "/pricing" },
              { label: "Ghost Check", href: "/ghost-check" },
              { label: "Salary Check", href: "/salary-check" },
              { label: "Weekly Report", href: "/reports/weekly" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm transition-colors hover:underline"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--text-primary)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--text-muted)")
                }
              >
                {link.label}
              </Link>
            ))}
          </div>

          <span
            className="text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            Built with AI. 2026.
          </span>
        </div>
      </footer>
    </div>
  );
}
