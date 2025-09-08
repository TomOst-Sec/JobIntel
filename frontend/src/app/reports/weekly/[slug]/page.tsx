"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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

export default function WeeklyReportBySlugPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/v1/public/reports/weekly/${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error("Report not found");
        return r.json();
      })
      .then(setReport)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

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
          <Link href="/reports/weekly" className="text-sm transition-colors" style={{ color: "var(--text-secondary)" }}>All Reports</Link>
          <Link href="/ghost-check" className="text-sm transition-colors" style={{ color: "var(--text-secondary)" }}>Ghost Check</Link>
          <Link href="/salary-check" className="text-sm transition-colors" style={{ color: "var(--text-secondary)" }}>Salary Check</Link>
          <Link href="/login">
            <Button variant="secondary" size="sm">Log in</Button>
          </Link>
        </div>
      </nav>

      {/* Loading */}
      {loading && (
        <div className="max-w-4xl mx-auto py-24 px-4 animate-pulse space-y-6">
          <div className="h-8 rounded w-2/3" style={{ backgroundColor: "var(--bg-elevated)" }} />
          <div className="h-4 rounded w-1/2" style={{ backgroundColor: "var(--bg-elevated)" }} />
          <div className="h-64 rounded" style={{ backgroundColor: "var(--bg-elevated)" }} />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="max-w-4xl mx-auto py-24 px-4 text-center">
          <h2 className="text-2xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>Report Not Found</h2>
          <p className="mb-8" style={{ color: "var(--text-secondary)" }}>This report doesn&apos;t exist or is no longer available.</p>
          <Link href="/reports/weekly">
            <Button variant="secondary">View Latest Report</Button>
          </Link>
        </div>
      )}

      {/* Report */}
      {report && !loading && (
        <div className="max-w-4xl mx-auto py-12 px-4">
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
              <div key={i} className="rounded-xl p-6" style={cardStyle}>
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

          {/* Share + meta */}
          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={() => navigator.clipboard.writeText(window.location.href)}
              className="text-sm px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: "var(--cyan)", border: "1px solid var(--cyan-15)" }}
            >
              Copy link to share
            </button>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Generated in {report.generation_time_ms}ms
            </p>
          </div>

          {/* CTA */}
          <div
            className="mt-12 text-center rounded-xl py-10 px-4"
            style={{ background: "linear-gradient(to bottom, var(--cyan-08), transparent)" }}
          >
            <h3 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Get Weekly Reports in Your Inbox</h3>
            <p className="mb-4" style={{ color: "var(--text-secondary)" }}>Plus personalized intelligence for your tracked companies and skills.</p>
            <Link href="/signup">
              <Button size="lg">Sign Up Free</Button>
            </Link>
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
