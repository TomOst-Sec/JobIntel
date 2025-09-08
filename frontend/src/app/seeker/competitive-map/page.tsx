"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

/* ── Types ───────────────────────────────────────────── */

interface Competitor {
  company: string;
  overlapping_roles: string[];
  total_overlap: number;
}

interface CompanyCompetitors {
  company: string;
  competitor_count: number;
  competitors: Competitor[];
}

interface SEOStats {
  total_pages: number;
  by_type: Record<string, { count: number; total_jobs: number }>;
}

interface TranslationStats {
  total_translations: number;
  by_language: Record<string, { count: number; methods: Record<string, { count: number; avg_quality: number | null }> }>;
}

type TabId = "competitors" | "seo" | "translations";

/* ── Component ───────────────────────────────────────── */

export default function CompetitiveMapPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<TabId>("competitors");
  const [companyInput, setCompanyInput] = useState("");
  const [competitors, setCompetitors] = useState<CompanyCompetitors | null>(null);
  const [seoStats, setSeoStats] = useState<SEOStats | null>(null);
  const [translationStats, setTranslationStats] = useState<TranslationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  // Load stats on tab switch
  useEffect(() => {
    if (tab === "seo" && !seoStats) {
      api.get<SEOStats>("/content/seo/stats").then(setSeoStats).catch(() => {});
    }
    if (tab === "translations" && !translationStats) {
      api.get<TranslationStats>("/content/translate/stats").then(setTranslationStats).catch(() => {});
    }
  }, [tab, seoStats, translationStats]);

  const searchCompetitors = useCallback(async () => {
    if (!companyInput.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.get<CompanyCompetitors>(
        `/market/competitive/company/${encodeURIComponent(companyInput)}`
      );
      setCompetitors(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [companyInput]);

  if (authLoading || !user) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: "competitors", label: "Company Competitors" },
    { id: "seo", label: "SEO Pages" },
    { id: "translations", label: "Translations" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-deep)" }}>
      <TopNav />
      <main className="max-w-5xl mx-auto px-4 pt-20 pb-28 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Intelligence Hub
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Competitive analysis, SEO insights, and global translation coverage
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--bg-surface)" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: tab === t.id ? "var(--cyan-15)" : "transparent",
                color: tab === t.id ? "var(--cyan)" : "var(--text-muted)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-3 rounded-lg text-sm" style={{ background: "var(--red-15)", color: "var(--red)" }}>
            {error}
          </div>
        )}

        {/* Competitors Tab */}
        {tab === "competitors" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                value={companyInput}
                onChange={(e) => setCompanyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchCompetitors()}
                placeholder="Company name (e.g., Stripe)"
                className="flex-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
              />
              <Button onClick={searchCompetitors} disabled={loading || !companyInput.trim()}>
                {loading ? "Finding..." : "Find Competitors"}
              </Button>
            </div>

            {competitors && (
              <div className="space-y-3">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {competitors.competitor_count} companies competing for the same talent as{" "}
                  <span style={{ color: "var(--cyan)" }}>{competitors.company}</span>
                </p>

                {competitors.competitors.map((comp, i) => (
                  <div key={i} className="glass-card p-4 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>#{i + 1}</span>
                        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{comp.company}</span>
                      </div>
                      <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "var(--cyan-15)", color: "var(--cyan)" }}>
                        {comp.total_overlap} overlapping postings
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {comp.overlapping_roles.map((role, j) => (
                        <span
                          key={j}
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: "var(--bg-surface)", color: "var(--text-secondary)" }}
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}

                {competitors.competitors.length === 0 && (
                  <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
                    No competitors found. This company may not have enough recent postings for analysis.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* SEO Tab */}
        {tab === "seo" && (
          <div className="space-y-4">
            {seoStats ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="glass-card p-3 rounded-xl">
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Total Pages</p>
                    <p className="text-lg font-bold font-mono" style={{ color: "var(--cyan)" }}>
                      {seoStats.total_pages}
                    </p>
                  </div>
                  {Object.entries(seoStats.by_type).map(([type, data]) => (
                    <div key={type} className="glass-card p-3 rounded-xl">
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {type.replace(/_/g, " ")}
                      </p>
                      <p className="text-lg font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                        {data.count}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {data.total_jobs?.toLocaleString()} jobs covered
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>Loading SEO stats...</p>
            )}
          </div>
        )}

        {/* Translations Tab */}
        {tab === "translations" && (
          <div className="space-y-4">
            {translationStats ? (
              <>
                <div className="glass-card p-3 rounded-xl">
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Total Translations</p>
                  <p className="text-lg font-bold font-mono" style={{ color: "var(--cyan)" }}>
                    {translationStats.total_translations}
                  </p>
                </div>

                <div className="glass-card p-4 rounded-xl space-y-3">
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>By Language</h3>
                  <div className="space-y-2">
                    {Object.entries(translationStats.by_language).map(([lang, data]) => (
                      <div key={lang} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-semibold" style={{ color: "var(--cyan)" }}>
                            {lang.toUpperCase()}
                          </span>
                          <span className="text-sm" style={{ color: "var(--text-primary)" }}>{data.count} jobs</span>
                        </div>
                        <div className="flex gap-2">
                          {Object.entries(data.methods).map(([method, mdata]) => (
                            <span key={method} className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-surface)", color: "var(--text-muted)" }}>
                              {method}: {mdata.count} {mdata.avg_quality ? `(${(mdata.avg_quality * 100).toFixed(0)}%)` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {translationStats.total_translations === 0 && (
                  <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>
                    No translations yet. Translations are generated when non-English jobs are detected.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>Loading translation stats...</p>
            )}
          </div>
        )}
      </main>
      <MobileNav />
    </div>
  );
}
