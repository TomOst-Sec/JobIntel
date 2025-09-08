"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Button } from "@/components/ui/button";
import { LiveCounter } from "@/components/ui/live-counter";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

/* ── Types ───────────────────────────────────────────── */

interface SalaryBenchmark {
  role: string;
  location: string | null;
  data_points: number;
  percentiles: Record<string, number | null>;
  avg_salary: number | null;
  top_companies: { company: string; avg_salary: number; sample_size: number }[];
}

interface SalaryReality {
  job_id: string | null;
  company: string;
  title: string;
  location: string | null;
  posted_min: number | null;
  posted_max: number | null;
  h1b_actual_avg: number | null;
  h1b_sample_size: number;
  market_p25: number | null;
  market_p50: number | null;
  market_p75: number | null;
  market_p90: number | null;
  community_reported_avg: number | null;
  gap_analysis: string;
  negotiation_leverage: string;
  transparency_grade: string;
}

interface CompanySalaryData {
  company: string;
  count: number;
  data: SalaryReality[];
}

type TabId = "benchmarks" | "company" | "h1b";

/* ── Helpers ─────────────────────────────────────────── */

function gradeColor(grade: string) {
  const map: Record<string, { color: string; bg: string }> = {
    A: { color: "var(--green)", bg: "var(--green-15)" },
    B: { color: "var(--cyan)", bg: "var(--cyan-15)" },
    C: { color: "var(--gold)", bg: "var(--gold-15)" },
    D: { color: "var(--red)", bg: "var(--red-15)" },
    F: { color: "var(--red)", bg: "var(--red-15)" },
  };
  return map[grade] || { color: "var(--text-muted)", bg: "var(--bg-surface)" };
}

function leverageColor(leverage: string) {
  const map: Record<string, string> = {
    STRONG: "var(--green)",
    MODERATE: "var(--gold)",
    WEAK: "var(--red)",
    UNKNOWN: "var(--text-muted)",
  };
  return map[leverage] || "var(--text-muted)";
}

function formatSalary(n: number | null | undefined): string {
  if (!n) return "—";
  return `$${n.toLocaleString()}`;
}

/* ── Component ───────────────────────────────────────── */

export default function SalaryRealityPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<TabId>("benchmarks");
  const [roleQuery, setRoleQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [companyQuery, setCompanyQuery] = useState("");
  const [benchmark, setBenchmark] = useState<SalaryBenchmark | null>(null);
  const [companyData, setCompanyData] = useState<CompanySalaryData | null>(null);
  const [h1bData, setH1bData] = useState<{ count: number; data: Record<string, unknown>[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  const searchBenchmarks = useCallback(async () => {
    if (!roleQuery.trim()) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ role: roleQuery });
      if (locationQuery.trim()) params.set("location", locationQuery);
      const data = await api.get<SalaryBenchmark>(`/intelligence/salary/benchmarks?${params}`);
      setBenchmark(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [roleQuery, locationQuery]);

  const searchCompany = useCallback(async () => {
    if (!companyQuery.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.get<CompanySalaryData>(`/intelligence/salary/company/${encodeURIComponent(companyQuery)}`);
      setCompanyData(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [companyQuery]);

  const searchH1b = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (companyQuery.trim()) params.set("company", companyQuery);
      if (roleQuery.trim()) params.set("title", roleQuery);
      const data = await api.get<{ count: number; data: Record<string, unknown>[] }>(`/intelligence/salary/h1b?${params}`);
      setH1bData(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [companyQuery, roleQuery]);

  if (authLoading || !user) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: "benchmarks", label: "Role Benchmarks" },
    { id: "company", label: "Company Reality" },
    { id: "h1b", label: "H1B Data" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-deep)" }}>
      <TopNav />
      <main className="max-w-6xl mx-auto px-4 pt-20 pb-28 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Salary Reality Engine
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            What companies actually pay vs. what they advertise — powered by H1B data, market benchmarks, and community reports
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

        {/* Error */}
        {error && (
          <div className="p-3 rounded-lg text-sm" style={{ background: "var(--red-15)", color: "var(--red)" }}>
            {error}
          </div>
        )}

        {/* Role Benchmarks Tab */}
        {tab === "benchmarks" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                value={roleQuery}
                onChange={(e) => setRoleQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchBenchmarks()}
                placeholder="Job title (e.g., Senior Software Engineer)"
                className="flex-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
              />
              <input
                value={locationQuery}
                onChange={(e) => setLocationQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchBenchmarks()}
                placeholder="Location (optional)"
                className="w-48 px-3 py-2 rounded-lg text-sm"
                style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
              />
              <Button onClick={searchBenchmarks} disabled={loading || !roleQuery.trim()}>
                {loading ? "Searching..." : "Search"}
              </Button>
            </div>

            {benchmark && (
              <div className="space-y-4">
                {/* Summary stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Data Points" value={benchmark.data_points.toString()} />
                  <StatCard label="Median" value={formatSalary(benchmark.avg_salary)} accent="var(--cyan)" />
                  <StatCard label="P25" value={formatSalary(benchmark.percentiles.p25)} />
                  <StatCard label="P75" value={formatSalary(benchmark.percentiles.p75)} accent="var(--green)" />
                </div>

                {/* Percentile bar */}
                {benchmark.percentiles.p10 && (
                  <div className="glass-card p-4 rounded-xl space-y-3">
                    <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Salary Distribution</h3>
                    <PercentileBar percentiles={benchmark.percentiles} />
                  </div>
                )}

                {/* Top companies */}
                {benchmark.top_companies.length > 0 && (
                  <div className="glass-card p-4 rounded-xl space-y-3">
                    <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Top Paying Companies</h3>
                    <div className="space-y-2">
                      {benchmark.top_companies.map((c, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>#{i + 1}</span>
                            <span className="text-sm" style={{ color: "var(--text-primary)" }}>{c.company}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-mono font-semibold" style={{ color: "var(--green)" }}>
                              {formatSalary(c.avg_salary)}
                            </span>
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{c.sample_size} roles</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Company Reality Tab */}
        {tab === "company" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                value={companyQuery}
                onChange={(e) => setCompanyQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchCompany()}
                placeholder="Company name (e.g., Google)"
                className="flex-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
              />
              <Button onClick={searchCompany} disabled={loading || !companyQuery.trim()}>
                {loading ? "Analyzing..." : "Analyze"}
              </Button>
            </div>

            {companyData && (
              <div className="space-y-3">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {companyData.count} salary reality records for &ldquo;{companyData.company}&rdquo;
                </p>
                {companyData.data.map((sr, i) => (
                  <SalaryRealityCard key={i} data={sr} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* H1B Tab */}
        {tab === "h1b" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                value={companyQuery}
                onChange={(e) => setCompanyQuery(e.target.value)}
                placeholder="Company (optional)"
                className="flex-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
              />
              <input
                value={roleQuery}
                onChange={(e) => setRoleQuery(e.target.value)}
                placeholder="Job title (optional)"
                className="flex-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
              />
              <Button onClick={searchH1b} disabled={loading}>
                {loading ? "Searching..." : "Search H1B"}
              </Button>
            </div>

            {h1bData && (
              <div className="space-y-3">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>{h1bData.count} H1B records</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <th className="text-left py-2 px-2" style={{ color: "var(--text-muted)" }}>Company</th>
                        <th className="text-left py-2 px-2" style={{ color: "var(--text-muted)" }}>Title</th>
                        <th className="text-right py-2 px-2" style={{ color: "var(--text-muted)" }}>Salary</th>
                        <th className="text-left py-2 px-2" style={{ color: "var(--text-muted)" }}>Level</th>
                        <th className="text-left py-2 px-2" style={{ color: "var(--text-muted)" }}>Location</th>
                        <th className="text-right py-2 px-2" style={{ color: "var(--text-muted)" }}>Year</th>
                      </tr>
                    </thead>
                    <tbody>
                      {h1bData.data.map((row, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td className="py-2 px-2" style={{ color: "var(--text-primary)" }}>{String(row.company_name || "")}</td>
                          <td className="py-2 px-2" style={{ color: "var(--text-secondary)" }}>{String(row.job_title || "")}</td>
                          <td className="py-2 px-2 text-right font-mono" style={{ color: "var(--green)" }}>
                            {formatSalary(row.wage_annual as number)}
                          </td>
                          <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>{String(row.wage_level || "")}</td>
                          <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>
                            {String(row.worksite_city || "")}, {String(row.worksite_state || "")}
                          </td>
                          <td className="py-2 px-2 text-right" style={{ color: "var(--text-muted)" }}>{String(row.year || "")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      <MobileNav />
    </div>
  );
}

/* ── Sub-Components ──────────────────────────────────── */

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="glass-card p-3 rounded-xl">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-lg font-bold font-mono mt-0.5" style={{ color: accent || "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

function PercentileBar({ percentiles }: { percentiles: Record<string, number | null> }) {
  const p10 = percentiles.p10 || 0;
  const p90 = percentiles.p90 || 0;
  const range = p90 - p10 || 1;

  const markers = [
    { key: "p10", value: percentiles.p10, label: "P10", color: "var(--text-muted)" },
    { key: "p25", value: percentiles.p25, label: "P25", color: "var(--gold)" },
    { key: "p50", value: percentiles.p50, label: "P50", color: "var(--cyan)" },
    { key: "p75", value: percentiles.p75, label: "P75", color: "var(--green)" },
    { key: "p90", value: percentiles.p90, label: "P90", color: "var(--purple)" },
  ];

  return (
    <div className="relative h-16 mt-2">
      <div
        className="absolute top-6 left-0 right-0 h-2 rounded-full"
        style={{ background: "var(--bg-surface)" }}
      />
      {markers.map((m) => {
        if (!m.value) return null;
        const pct = ((m.value - p10) / range) * 100;
        return (
          <div
            key={m.key}
            className="absolute flex flex-col items-center"
            style={{ left: `${Math.max(2, Math.min(98, pct))}%`, transform: "translateX(-50%)" }}
          >
            <span className="text-[10px] font-mono" style={{ color: m.color }}>
              {m.label}
            </span>
            <div className="w-3 h-3 rounded-full mt-0.5" style={{ background: m.color }} />
            <span className="text-[10px] font-mono mt-1" style={{ color: "var(--text-muted)" }}>
              {formatSalary(m.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SalaryRealityCard({ data }: { data: SalaryReality }) {
  const gc = gradeColor(data.transparency_grade);
  return (
    <div className="glass-card p-4 rounded-xl space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{data.title}</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {data.company}{data.location ? ` · ${data.location}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{ background: gc.bg, color: gc.color }}
          >
            Grade {data.transparency_grade}
          </span>
          <span
            className="text-xs font-medium"
            style={{ color: leverageColor(data.negotiation_leverage) }}
          >
            {data.negotiation_leverage} leverage
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div>
          <span style={{ color: "var(--text-muted)" }}>Posted: </span>
          <span className="font-mono" style={{ color: "var(--text-primary)" }}>
            {data.posted_min ? `${formatSalary(data.posted_min)}–${formatSalary(data.posted_max)}` : "Not disclosed"}
          </span>
        </div>
        <div>
          <span style={{ color: "var(--text-muted)" }}>H1B Actual: </span>
          <span className="font-mono" style={{ color: "var(--cyan)" }}>
            {formatSalary(data.h1b_actual_avg)}
          </span>
          {data.h1b_sample_size > 0 && (
            <span style={{ color: "var(--text-muted)" }}> ({data.h1b_sample_size})</span>
          )}
        </div>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Market P50: </span>
          <span className="font-mono" style={{ color: "var(--green)" }}>{formatSalary(data.market_p50)}</span>
        </div>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Community: </span>
          <span className="font-mono" style={{ color: "var(--gold)" }}>{formatSalary(data.community_reported_avg)}</span>
        </div>
      </div>

      {data.gap_analysis && (
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {data.gap_analysis}
        </p>
      )}
    </div>
  );
}
