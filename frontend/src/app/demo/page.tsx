"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DemoPage() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--bg-void)", color: "var(--text-primary)" }}
    >
      {/* Nav */}
      <nav
        className="glass sticky top-0 z-50 flex items-center justify-between px-6 md:px-10 py-3"
      >
        <Link href="/" className="font-display text-xl tracking-tight">
          JOB<span style={{ color: "var(--cyan)" }}>INTEL</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">Sign In</Button>
          </Link>
          <Link href="/signup">
            <Button variant="primary" size="sm">Try Free</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto text-center py-16 px-4">
        <h1 className="font-display text-4xl md:text-5xl mb-4">
          Live <span style={{ color: "var(--cyan)" }}>Demo</span>
        </h1>
        <p
          className="text-lg max-w-xl mx-auto mb-12"
          style={{ color: "var(--text-secondary)" }}
        >
          See what JobIntel looks like in action. Explore the core features below — no account needed.
        </p>

        {/* Demo cards */}
        <div className="grid md:grid-cols-2 gap-6 text-left">
          {/* Ghost Check */}
          <Link
            href="/ghost-check"
            className="card p-6 group transition-all duration-200"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
              style={{ background: "var(--red-15)", color: "var(--red)" }}
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C7.58 2 4 5.58 4 10v10.5c0 .83 1 1.25 1.59.66l1.41-1.41 1.41 1.41a1 1 0 001.42 0L11.24 20l1.41 1.41a1 1 0 001.42 0L15.48 20l1.41 1.41c.59.59 1.59.17 1.59-.66V10c0-4.42-3.58-8-8-8z" />
                <circle cx="9" cy="10" r="1.5" fill="currentColor" />
                <circle cx="15" cy="10" r="1.5" fill="currentColor" />
              </svg>
            </div>
            <h3 className="font-display text-lg mb-1">Ghost Job Checker</h3>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Paste any job URL and get an instant ghost score with detailed signal analysis.
            </p>
            <span
              className="inline-block mt-3 text-sm font-medium"
              style={{ color: "var(--red)" }}
            >
              Try it now &rarr;
            </span>
          </Link>

          {/* Salary Check */}
          <Link
            href="/salary-check"
            className="card p-6 group transition-all duration-200"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
              style={{ background: "var(--green-15)", color: "var(--green)" }}
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
            </div>
            <h3 className="font-display text-lg mb-1">Salary Intelligence</h3>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Get real salary percentiles for any role in any market from live job data.
            </p>
            <span
              className="inline-block mt-3 text-sm font-medium"
              style={{ color: "var(--green)" }}
            >
              Try it now &rarr;
            </span>
          </Link>

          {/* Weekly Report */}
          <Link
            href="/reports/weekly"
            className="card p-6 group transition-all duration-200"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
              style={{ background: "var(--purple-15)", color: "var(--purple)" }}
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 7l-10 7L2 7" />
              </svg>
            </div>
            <h3 className="font-display text-lg mb-1">Weekly Market Report</h3>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              AI-powered intelligence on which companies are scaling, who is in trouble, and where the opportunities are.
            </p>
            <span
              className="inline-block mt-3 text-sm font-medium"
              style={{ color: "var(--purple)" }}
            >
              Read report &rarr;
            </span>
          </Link>

          {/* Sign Up CTA */}
          <div
            className="card p-6 flex flex-col justify-center items-center text-center"
            style={{
              borderColor: "var(--cyan-15)",
              background: "linear-gradient(135deg, rgba(0,212,255,0.05) 0%, transparent 100%)",
            }}
          >
            <h3 className="font-display text-lg mb-2">Want the full experience?</h3>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
              Create a free account to access AI chat, job matching, career roadmaps, and more.
            </p>
            <Link href="/signup">
              <Button variant="primary" size="lg">Create Free Account</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="py-8 text-center text-sm"
        style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
      >
        <p>JobIntel &copy; 2026. AI-Powered Hiring Intelligence.</p>
      </footer>
    </div>
  );
}
