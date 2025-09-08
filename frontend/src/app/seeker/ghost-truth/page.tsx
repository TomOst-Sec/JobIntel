"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

/* ── Types ───────────────────────────────────────────── */

interface GhostClassification {
  ghost_type: string | null;
  ghost_type_confidence: number;
  ghost_classification_evidence: string;
  ghost_candidate_advice: string;
  verdict: string;
}

interface GhostTypeStats {
  PASSIVE: number;
  INSURANCE: number;
  PIPELINE: number;
  NARRATIVE: number;
  COMPETITIVE: number;
  EVERGREEN: number;
  total_classified: number;
  unclassified: number;
}

interface Evidence {
  signal: string;
  detail: string;
  weight: number;
}

/* ── Constants ───────────────────────────────────────── */

const GHOST_TYPE_META: Record<string, { label: string; color: string; bg: string; icon: string; risk: string }> = {
  PASSIVE: { label: "Passive Ghost", color: "var(--gold)", bg: "var(--gold-15)", icon: "💤", risk: "Medium" },
  INSURANCE: { label: "Insurance Ghost", color: "var(--red)", bg: "var(--red-15)", icon: "📋", risk: "High" },
  PIPELINE: { label: "Pipeline Ghost", color: "var(--cyan)", bg: "var(--cyan-15)", icon: "🔄", risk: "Medium" },
  NARRATIVE: { label: "Narrative Ghost", color: "var(--red)", bg: "var(--red-15)", icon: "📈", risk: "Very High" },
  COMPETITIVE: { label: "Competitive Intel", color: "var(--purple)", bg: "var(--purple-15)", icon: "🔍", risk: "High" },
  EVERGREEN: { label: "Evergreen Ghost", color: "var(--text-muted)", bg: "var(--bg-surface)", icon: "♻️", risk: "Variable" },
};

/* ── Component ───────────────────────────────────────── */

export default function GhostTruthPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [jobIdInput, setJobIdInput] = useState("");
  const [classification, setClassification] = useState<GhostClassification | null>(null);
  const [stats, setStats] = useState<GhostTypeStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  // Load stats on mount
  useEffect(() => {
    api.get<GhostTypeStats>("/enrichment/ghost-truth/stats").then(setStats).catch(() => {});
  }, []);

  const classify = useCallback(async () => {
    if (!jobIdInput.trim()) return;
    setLoading(true);
    setError("");
    setClassification(null);
    try {
      const data = await api.get<GhostClassification>(`/enrichment/ghost-truth/${encodeURIComponent(jobIdInput)}`);
      setClassification(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Classification failed");
    } finally {
      setLoading(false);
    }
  }, [jobIdInput]);

  if (authLoading || !user) return null;

  let evidence: Evidence[] = [];
  if (classification?.ghost_classification_evidence) {
    try {
      evidence = JSON.parse(classification.ghost_classification_evidence);
    } catch {
      /* ignore */
    }
  }

  const typeMeta = classification?.ghost_type ? GHOST_TYPE_META[classification.ghost_type] : null;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-deep)" }}>
      <TopNav />
      <main className="max-w-4xl mx-auto px-4 pt-20 pb-28 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Ghost Truth Engine
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            6-type ghost job classification — know exactly WHY a job is fake and what to do about it
          </p>
        </div>

        {/* Ghost Type Stats Overview */}
        {stats && stats.total_classified > 0 && (
          <div className="glass-card p-4 rounded-xl space-y-3">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Ghost Distribution ({stats.total_classified} classified)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(GHOST_TYPE_META).map(([key, meta]) => {
                const count = stats[key as keyof GhostTypeStats] as number || 0;
                const pct = stats.total_classified > 0 ? (count / stats.total_classified * 100) : 0;
                return (
                  <div key={key} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: meta.bg }}>
                    <span className="text-lg">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: meta.color }}>{meta.label}</p>
                      <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{count} ({pct.toFixed(0)}%)</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="flex gap-2">
          <input
            value={jobIdInput}
            onChange={(e) => setJobIdInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && classify()}
            placeholder="Enter Job ID to classify..."
            className="flex-1 px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
          />
          <Button onClick={classify} disabled={loading || !jobIdInput.trim()}>
            {loading ? "Classifying..." : "Classify Ghost Type"}
          </Button>
        </div>

        {error && (
          <div className="p-3 rounded-lg text-sm" style={{ background: "var(--red-15)", color: "var(--red)" }}>
            {error}
          </div>
        )}

        {/* Classification Result */}
        {classification && (
          <div className="space-y-4">
            {/* Verdict */}
            <div className="glass-card p-5 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {typeMeta && <span className="text-3xl">{typeMeta.icon}</span>}
                  <div>
                    <p className="text-lg font-bold" style={{ color: typeMeta?.color || "var(--green)" }}>
                      {typeMeta ? typeMeta.label : "Likely Real"}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {typeMeta ? `Risk: ${typeMeta.risk}` : "Low ghost risk"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold font-mono" style={{
                    color: classification.verdict === "likely_ghost" ? "var(--red)" :
                           classification.verdict === "suspicious" ? "var(--gold)" : "var(--green)",
                  }}>
                    {(classification.ghost_type_confidence * 100).toFixed(0)}%
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>confidence</p>
                </div>
              </div>

              {/* Verdict badge */}
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{
                  background: classification.verdict === "likely_ghost" ? "var(--red-15)" :
                              classification.verdict === "suspicious" ? "var(--gold-15)" : "var(--green-15)",
                  color: classification.verdict === "likely_ghost" ? "var(--red)" :
                         classification.verdict === "suspicious" ? "var(--gold)" : "var(--green)",
                }}>
                  {classification.verdict.replace("_", " ").toUpperCase()}
                </span>
              </div>
            </div>

            {/* Advice */}
            <div className="glass-card p-4 rounded-xl">
              <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--cyan)" }}>
                What You Should Do
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {classification.ghost_candidate_advice}
              </p>
            </div>

            {/* Evidence */}
            {evidence.length > 0 && (
              <div className="glass-card p-4 rounded-xl space-y-3">
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Evidence ({evidence.length} signals)
                </h3>
                <div className="space-y-2">
                  {evidence.map((ev, i) => (
                    <div key={i} className="flex items-start gap-3 p-2 rounded-lg" style={{ background: "var(--bg-surface)" }}>
                      <div className="flex-shrink-0 w-12">
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-deep)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (ev.weight || 0) * 100)}%`,
                              background: ev.weight > 0.3 ? "var(--red)" : ev.weight > 0.15 ? "var(--gold)" : "var(--text-muted)",
                            }}
                          />
                        </div>
                        <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {((ev.weight || 0) * 100).toFixed(0)}%
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                          {ev.signal.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{ev.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Ghost Type Reference Guide */}
        <div className="glass-card p-4 rounded-xl space-y-3">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Ghost Type Reference
          </h3>
          <div className="grid gap-2">
            {Object.entries(GHOST_TYPE_META).map(([key, meta]) => (
              <div key={key} className="flex items-start gap-3 p-2 rounded-lg" style={{ background: meta.bg }}>
                <span className="text-xl flex-shrink-0">{meta.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium" style={{ color: meta.color }}>{meta.label}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-deep)", color: "var(--text-muted)" }}>
                      Risk: {meta.risk}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {key === "PASSIVE" && "Posted and forgotten — hiring manager moved on"}
                    {key === "INSURANCE" && "Posted for legal/HR compliance, not genuine hiring intent"}
                    {key === "PIPELINE" && "Building a talent pool, may hire if exceptional candidate appears"}
                    {key === "NARRATIVE" && "Burst of postings for investor/market optics, not real headcount"}
                    {key === "COMPETITIVE" && "Watching what talent is available, not actively hiring"}
                    {key === "EVERGREEN" && "Same role reposted for months/years — perpetual pipeline"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
