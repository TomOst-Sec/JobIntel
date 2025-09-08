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

interface Signal {
  signal_type: string;
  label: string;
  severity: string;
  company: string | null;
  detail: string;
  impact_score: number;
  metadata: Record<string, unknown>;
  detected_at: string;
}

interface MarketSnapshot {
  generated_at: string;
  summary: {
    total_jobs_30d: number;
    total_jobs_90d: number;
    companies_hiring: number;
    avg_salary: number | null;
    total_signals: number;
    critical_signals: number;
  };
  signals: Signal[];
  signals_by_type: Record<string, Signal[]>;
}

interface CompetitiveLandscape {
  role_key: string;
  location_key: string;
  seniority: string | null;
  total_competing_companies: number;
  total_competing_postings: number;
  talent_scarcity_score: number | null;
  market_clearing_salary_min: number | null;
  market_clearing_salary_max: number | null;
  companies_data: CompetitorCompany[];
}

interface CompetitorCompany {
  company: string;
  posting_count: number;
  avg_salary: number | null;
  salary_position: string | null;
  ghost_rate: number;
  urgency: string;
}

type TabId = "overview" | "velocity" | "skills" | "competitive";

/* ── Helpers ─────────────────────────────────────────── */

function severityStyle(s: string): { color: string; bg: string } {
  const map: Record<string, { color: string; bg: string }> = {
    critical: { color: "var(--red)", bg: "var(--red-15)" },
    warning: { color: "var(--gold)", bg: "var(--gold-15)" },
    info: { color: "var(--cyan)", bg: "var(--cyan-15)" },
  };
  return map[s] || map.info;
}

function urgencyStyle(u: string): { color: string; label: string } {
  const map: Record<string, { color: string; label: string }> = {
    critical: { color: "var(--red)", label: "CRITICAL" },
    high: { color: "var(--gold)", label: "HIGH" },
    moderate: { color: "var(--cyan)", label: "MODERATE" },
    low: { color: "var(--text-muted)", label: "LOW" },
  };
  return map[u] || { color: "var(--text-muted)", label: u.toUpperCase() };
}

/* ── Component ───────────────────────────────────────── */

export default function MarketSignalsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<TabId>("overview");
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [velocityData, setVelocityData] = useState<{ surges: Signal[]; freezes: Signal[] } | null>(null);
  const [skillData, setSkillData] = useState<{ rising_skills: Signal[]; declining_skills: Signal[] } | null>(null);
  const [competitive, setCompetitive] = useState<CompetitiveLandscape | null>(null);
  const [roleInput, setRoleInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  // Load snapshot on mount
  useEffect(() => {
    api.get<MarketSnapshot>("/market/signals/snapshot")
      .then(setSnapshot)
      .catch(() => {});
  }, []);

  const loadVelocity = useCallback(async () => {
    try {
      const data = await api.get<{ surges: Signal[]; freezes: Signal[] }>("/market/signals/velocity");
      setVelocityData(data);
    } catch { /* ignore */ }
  }, []);

  const loadSkills = useCallback(async () => {
    try {
      const data = await api.get<{ rising_skills: Signal[]; declining_skills: Signal[] }>("/market/signals/skills");
      setSkillData(data);
    } catch { /* ignore */ }
  }, []);

  const searchCompetitive = useCallback(async () => {
    if (!roleInput.trim()) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ role: roleInput });
      if (locationInput.trim()) params.set("location", locationInput);
      const data = await api.get<CompetitiveLandscape>(`/market/competitive/landscape?${params}`);
      setCompetitive(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [roleInput, locationInput]);

  // Load tab data when switching
  useEffect(() => {
    if (tab === "velocity" && !velocityData) loadVelocity();
    if (tab === "skills" && !skillData) loadSkills();
  }, [tab, velocityData, skillData, loadVelocity, loadSkills]);

  if (authLoading || !user) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Market Overview" },
    { id: "velocity", label: "Hiring Velocity" },
    { id: "skills", label: "Skill Trends" },
    { id: "competitive", label: "Competitive Map" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-deep)" }}>
      <TopNav />
      <main className="max-w-6xl mx-auto px-4 pt-20 pb-28 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Market Intelligence
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Real-time hiring signals, competitive maps, and skill demand shifts
          </p>
        </div>

        {/* Stats */}
        {snapshot && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <LiveCounter label="Jobs (30d)" value={snapshot.summary.total_jobs_30d} />
            <LiveCounter label="Companies Hiring" value={snapshot.summary.companies_hiring} />
            <LiveCounter label="Avg Salary" value={snapshot.summary.avg_salary || 0} prefix="$" />
            <LiveCounter label="Total Signals" value={snapshot.summary.total_signals} />
            <div className="glass-card p-3 rounded-xl">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Critical</p>
              <p className="text-lg font-bold font-mono" style={{ color: "var(--red)" }}>
                {snapshot.summary.critical_signals}
              </p>
            </div>
          </div>
        )}

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

        {/* Overview Tab */}
        {tab === "overview" && snapshot && (
          <div className="space-y-3">
            {snapshot.signals.slice(0, 20).map((signal, i) => (
              <SignalCard key={i} signal={signal} />
            ))}
            {snapshot.signals.length === 0 && (
              <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
                No market signals detected yet. Signals appear as more job data is collected.
              </p>
            )}
          </div>
        )}

        {/* Velocity Tab */}
        {tab === "velocity" && (
          <div className="space-y-4">
            {velocityData ? (
              <>
                <div className="glass-card p-4 rounded-xl space-y-3">
                  <h3 className="text-sm font-semibold" style={{ color: "var(--green)" }}>
                    Hiring Surges ({velocityData.surges.length})
                  </h3>
                  {velocityData.surges.length > 0 ? (
                    velocityData.surges.map((s, i) => <SignalCard key={i} signal={s} />)
                  ) : (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>No hiring surges detected</p>
                  )}
                </div>
                <div className="glass-card p-4 rounded-xl space-y-3">
                  <h3 className="text-sm font-semibold" style={{ color: "var(--red)" }}>
                    Hiring Freezes ({velocityData.freezes.length})
                  </h3>
                  {velocityData.freezes.length > 0 ? (
                    velocityData.freezes.map((s, i) => <SignalCard key={i} signal={s} />)
                  ) : (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>No hiring freezes detected</p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>Loading velocity data...</p>
            )}
          </div>
        )}

        {/* Skills Tab */}
        {tab === "skills" && (
          <div className="space-y-4">
            {skillData ? (
              <>
                <div className="glass-card p-4 rounded-xl space-y-3">
                  <h3 className="text-sm font-semibold" style={{ color: "var(--green)" }}>
                    Rising Skills ({skillData.rising_skills.length})
                  </h3>
                  {skillData.rising_skills.length > 0 ? (
                    skillData.rising_skills.map((s, i) => <SignalCard key={i} signal={s} />)
                  ) : (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>No rising skill trends detected</p>
                  )}
                </div>
                <div className="glass-card p-4 rounded-xl space-y-3">
                  <h3 className="text-sm font-semibold" style={{ color: "var(--red)" }}>
                    Declining Skills ({skillData.declining_skills.length})
                  </h3>
                  {skillData.declining_skills.length > 0 ? (
                    skillData.declining_skills.map((s, i) => <SignalCard key={i} signal={s} />)
                  ) : (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>No declining skill trends detected</p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>Loading skill data...</p>
            )}
          </div>
        )}

        {/* Competitive Map Tab */}
        {tab === "competitive" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                value={roleInput}
                onChange={(e) => setRoleInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchCompetitive()}
                placeholder="Role (e.g., Senior ML Engineer)"
                className="flex-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
              />
              <input
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchCompetitive()}
                placeholder="Location (optional)"
                className="w-48 px-3 py-2 rounded-lg text-sm"
                style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
              />
              <Button onClick={searchCompetitive} disabled={loading || !roleInput.trim()}>
                {loading ? "Mapping..." : "Map Competition"}
              </Button>
            </div>

            {competitive && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatBox label="Companies Competing" value={competitive.total_competing_companies.toString()} />
                  <StatBox label="Total Postings" value={competitive.total_competing_postings.toString()} />
                  <StatBox
                    label="Talent Scarcity"
                    value={competitive.talent_scarcity_score ? `${competitive.talent_scarcity_score.toFixed(0)}/100` : "—"}
                    accent={
                      (competitive.talent_scarcity_score || 0) > 60 ? "var(--red)" :
                      (competitive.talent_scarcity_score || 0) > 30 ? "var(--gold)" : "var(--green)"
                    }
                  />
                  <StatBox
                    label="Market Salary"
                    value={competitive.market_clearing_salary_min && competitive.market_clearing_salary_max
                      ? `$${(competitive.market_clearing_salary_min / 1000).toFixed(0)}k-$${(competitive.market_clearing_salary_max / 1000).toFixed(0)}k`
                      : "—"}
                    accent="var(--green)"
                  />
                </div>

                {/* Company table */}
                {competitive.companies_data.length > 0 && (
                  <div className="glass-card p-4 rounded-xl space-y-3">
                    <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      Competing Companies
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                            <th className="text-left py-2 px-2" style={{ color: "var(--text-muted)" }}>Company</th>
                            <th className="text-right py-2 px-2" style={{ color: "var(--text-muted)" }}>Postings</th>
                            <th className="text-right py-2 px-2" style={{ color: "var(--text-muted)" }}>Avg Salary</th>
                            <th className="text-left py-2 px-2" style={{ color: "var(--text-muted)" }}>Position</th>
                            <th className="text-left py-2 px-2" style={{ color: "var(--text-muted)" }}>Urgency</th>
                            <th className="text-right py-2 px-2" style={{ color: "var(--text-muted)" }}>Ghost %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {competitive.companies_data.map((c, i) => {
                            const urg = urgencyStyle(c.urgency);
                            return (
                              <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                                <td className="py-2 px-2 font-medium" style={{ color: "var(--text-primary)" }}>{c.company}</td>
                                <td className="py-2 px-2 text-right font-mono" style={{ color: "var(--cyan)" }}>{c.posting_count}</td>
                                <td className="py-2 px-2 text-right font-mono" style={{ color: "var(--green)" }}>
                                  {c.avg_salary ? `$${c.avg_salary.toLocaleString()}` : "—"}
                                </td>
                                <td className="py-2 px-2">
                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{
                                    background: c.salary_position === "above_market" ? "var(--green-15)" :
                                                c.salary_position === "below_market" ? "var(--red-15)" : "var(--bg-surface)",
                                    color: c.salary_position === "above_market" ? "var(--green)" :
                                           c.salary_position === "below_market" ? "var(--red)" : "var(--text-muted)",
                                  }}>
                                    {(c.salary_position || "unknown").replace("_", " ")}
                                  </span>
                                </td>
                                <td className="py-2 px-2">
                                  <span className="text-xs font-semibold" style={{ color: urg.color }}>{urg.label}</span>
                                </td>
                                <td className="py-2 px-2 text-right font-mono" style={{
                                  color: c.ghost_rate > 0.3 ? "var(--red)" : "var(--text-muted)",
                                }}>
                                  {(c.ghost_rate * 100).toFixed(0)}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
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

function SignalCard({ signal }: { signal: Signal }) {
  const style = severityStyle(signal.severity);
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "var(--bg-surface)" }}>
      <div className="flex-shrink-0 mt-0.5">
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: style.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: style.bg, color: style.color }}>
            {signal.label}
          </span>
          {signal.company && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{signal.company}</span>
          )}
          <span className="text-xs font-mono ml-auto" style={{ color: "var(--text-muted)" }}>
            {(signal.impact_score * 100).toFixed(0)}% impact
          </span>
        </div>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{signal.detail}</p>
      </div>
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="glass-card p-3 rounded-xl">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-lg font-bold font-mono mt-0.5" style={{ color: accent || "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}
