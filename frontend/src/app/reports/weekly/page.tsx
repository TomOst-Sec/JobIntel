"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";

interface ReportSection {
  heading: string;
  body: string;
  highlights?: string[];
}

interface WeeklyReport {
  id: number;
  title: string;
  summary: string;
  sections: ReportSection[];
  public_slug: string;
  week_start: string;
  week_end: string;
  ai_model: string;
  generation_time_ms: number;
  created_at: string;
}

export default function WeeklyReportPage() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState(0);

  useEffect(() => {
    fetch("/api/v1/public/reports/weekly/latest")
      .then((r) => {
        if (!r.ok) throw new Error("No report available");
        return r.json();
      })
      .then(setReport)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

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
          <Link href="/ghost-check" className="text-sm transition-colors" style={{ color: "var(--text-secondary)" }}>Ghost Check</Link>
          <Link href="/salary-check" className="text-sm transition-colors" style={{ color: "var(--text-secondary)" }}>Salary Check</Link>
          <Link href="/login">
            <Button variant="secondary" size="sm">Log in</Button>
          </Link>
        </div>
      </nav>

      {/* Loading */}
      {loading && (
        <div className="max-w-4xl mx-auto py-24 px-4">
          <div className="animate-pulse space-y-6">
            <div className="h-8 rounded w-2/3" style={{ backgroundColor: "var(--bg-elevated)" }} />
            <div className="h-4 rounded w-1/2" style={{ backgroundColor: "var(--bg-elevated)" }} />
            <div className="h-64 rounded" style={{ backgroundColor: "var(--bg-elevated)" }} />
          </div>
        </div>
      )}

      {/* Error / No report */}
      {error && !loading && (
        <div className="max-w-4xl mx-auto py-24 px-4 text-center">
          <h2 className="text-2xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>No Weekly Report Yet</h2>
          <p className="mb-8" style={{ color: "var(--text-secondary)" }}>The first weekly intelligence report hasn&apos;t been generated yet. Check back Monday.</p>
          <div className="flex gap-4 justify-center">
            <Link href="/ghost-check">
              <Button variant="secondary">Try Ghost Checker</Button>
            </Link>
            <Link href="/salary-check">
              <Button variant="secondary">Try Salary Check</Button>
            </Link>
          </div>
        </div>
      )}

      {/* Report */}
      {report && !loading && (
        <div className="max-w-5xl mx-auto py-12 px-4">
          <div className="flex gap-8">
            {/* Sidebar TOC */}
            <aside className="hidden lg:block w-56 flex-shrink-0">
              <div className="sticky top-8">
                <p className="text-xs uppercase tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>Sections</p>
                <nav className="space-y-1">
                  {report.sections.map((section, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setActiveSection(i);
                        document.getElementById(`section-${i}`)?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="block w-full text-left text-sm px-3 py-2 rounded-lg transition-colors"
                      style={{
                        backgroundColor: activeSection === i ? "var(--cyan-15)" : "transparent",
                        color: activeSection === i ? "var(--cyan)" : "var(--text-secondary)",
                      }}
                    >
                      {section.heading}
                    </button>
                  ))}
                </nav>

                <div className="mt-8 p-4 rounded-lg" style={cardStyle}>
                  <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Subscribe for weekly updates</p>
                  <Link href="/signup">
                    <Button size="sm" className="w-full">Get Reports via Email</Button>
                  </Link>
                </div>
              </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 min-w-0">
              {/* Header */}
              <div className="mb-8">
                <div className="flex items-center gap-3 text-sm mb-2" style={{ color: "var(--text-muted)" }}>
                  <span>{report.week_start} — {report.week_end}</span>
                  {report.ai_model && (
                    <span
                      className="px-2 py-0.5 rounded text-xs"
                      style={{ backgroundColor: "var(--cyan-15)", color: "var(--cyan)" }}
                    >
                      AI Generated
                    </span>
                  )}
                </div>
                <h1 className="text-3xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>{report.title}</h1>
                <p className="text-lg leading-relaxed" style={{ color: "var(--text-secondary)" }}>{report.summary}</p>
              </div>

              {/* Sections */}
              <div className="space-y-8">
                {report.sections.map((section, i) => (
                  <div
                    key={i}
                    id={`section-${i}`}
                    className="rounded-xl p-6"
                    style={cardStyle}
                  >
                    <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>{section.heading}</h2>
                    <div className="prose prose-invert prose-sm max-w-none" style={{ color: "var(--text-secondary)" }}>
                      <ReactMarkdown>{section.body}</ReactMarkdown>
                    </div>
                    {section.highlights && section.highlights.length > 0 && (
                      <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Key Highlights</p>
                        <ul className="space-y-1">
                          {section.highlights.map((h, j) => (
                            <li key={j} className="flex items-start gap-2 text-sm" style={{ color: "var(--cyan)" }}>
                              <span className="mt-0.5" style={{ color: "var(--cyan)" }}>-</span>
                              {h}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Share */}
              <div className="mt-8 flex items-center justify-between">
                <div className="flex gap-3">
                  <button
                    onClick={() => navigator.clipboard.writeText(window.location.href)}
                    className="text-sm px-3 py-1.5 rounded-lg transition-colors"
                    style={{ color: "var(--cyan)", border: "1px solid var(--cyan-15)" }}
                  >
                    Copy link
                  </button>
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Generated in {report.generation_time_ms}ms
                </p>
              </div>
            </main>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-8 text-center text-sm" style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
        <p>JobIntel &copy; 2026. AI-Powered Hiring Intelligence.</p>
      </footer>
    </div>
  );
}
