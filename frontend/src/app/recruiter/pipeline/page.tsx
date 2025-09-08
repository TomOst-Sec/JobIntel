"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";

interface Candidate {
  candidate_id: string;
  full_name: string;
  headline: string | null;
  skills: string[];
  experience_years: number | null;
  current_company: string | null;
  current_title: string | null;
  location: string | null;
}

interface PipelineEntry {
  pipeline_id: string;
  candidate: Candidate;
  stage: string;
  notes: string | null;
  rating: number | null;
  job_title: string | null;
  updated_at: string | null;
  created_at: string | null;
}

interface PipelineStats {
  sourced: number;
  contacted: number;
  responded: number;
  interview: number;
  offer: number;
  hired: number;
  rejected: number;
  withdrawn: number;
  total: number;
}

const STAGES = [
  { key: "sourced", label: "Sourced", color: "var(--text-muted)" },
  { key: "contacted", label: "Contacted", color: "var(--cyan)" },
  { key: "responded", label: "Responded", color: "var(--gold)" },
  { key: "interview", label: "Interview", color: "var(--purple)" },
  { key: "offer", label: "Offer", color: "var(--green)" },
  { key: "hired", label: "Hired", color: "var(--green)" },
];

const ALL_STAGES = ["sourced", "contacted", "responded", "interview", "offer", "hired", "rejected", "withdrawn"];

function StarRating({
  rating, onChange,
}: {
  rating: number | null;
  onChange: (r: number) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="text-sm transition-colors"
          style={{ color: (rating ?? 0) >= star ? "var(--gold)" : "var(--text-muted)" }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function PipelineCard({
  entry, onStageChange, onRatingChange,
}: {
  entry: PipelineEntry;
  onStageChange: (id: string, stage: string) => void;
  onRatingChange: (id: string, rating: number) => void;
}) {
  const c = entry.candidate;
  const daysInStage = entry.updated_at
    ? Math.floor((Date.now() - new Date(entry.updated_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div
      className="rounded-lg p-3 transition-all duration-200"
      style={{
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
            {c.full_name}
          </p>
          <p className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>
            {c.current_title || "—"} at {c.current_company || "—"}
          </p>
        </div>
        {daysInStage > 3 && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0"
            style={{ backgroundColor: "var(--red-15)", color: "var(--red)" }}
          >
            {daysInStage}d
          </span>
        )}
      </div>

      <StarRating rating={entry.rating} onChange={(r) => onRatingChange(entry.pipeline_id, r)} />

      {entry.notes && (
        <p className="text-[10px] mt-1 truncate" style={{ color: "var(--text-muted)" }}>
          {entry.notes}
        </p>
      )}

      <select
        value={entry.stage}
        onChange={(e) => onStageChange(entry.pipeline_id, e.target.value)}
        className="mt-2 w-full text-[11px] rounded-md px-2 py-1 outline-none"
        style={{
          backgroundColor: "var(--bg-surface)",
          color: "var(--text-secondary)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {ALL_STAGES.map((s) => (
          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
        ))}
      </select>
    </div>
  );
}

export default function RecruiterPipelinePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [entries, setEntries] = useState<PipelineEntry[]>([]);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [showRejected, setShowRejected] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || (user.role !== "recruiter" && user.role !== "admin"))) {
      router.push("/seeker");
    }
  }, [user, authLoading, router]);

  const fetchPipeline = useCallback(async () => {
    try {
      const [pipelineData, statsData] = await Promise.all([
        api.get<PipelineEntry[]>("/recruiter/pipeline"),
        api.get<PipelineStats>("/recruiter/pipeline/stats"),
      ]);
      setEntries(pipelineData);
      setStats(statsData);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  const handleStageChange = async (pipelineId: string, newStage: string) => {
    try {
      await api.put(`/recruiter/pipeline/${pipelineId}`, { stage: newStage });
      fetchPipeline();
    } catch { /* ignore */ }
  };

  const handleRatingChange = async (pipelineId: string, rating: number) => {
    try {
      await api.put(`/recruiter/pipeline/${pipelineId}`, { rating });
      setEntries((prev) =>
        prev.map((e) => e.pipeline_id === pipelineId ? { ...e, rating } : e)
      );
    } catch { /* ignore */ }
  };

  const filteredEntries = entries.filter((e) => {
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      const c = e.candidate;
      if (
        !c.full_name.toLowerCase().includes(q) &&
        !(c.current_company || "").toLowerCase().includes(q) &&
        !(c.current_title || "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  if (authLoading || loading) return null;

  return (
    <div style={{ backgroundColor: "var(--bg-deep)", minHeight: "100vh" }}>
      <TopNav showSearch={false} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Pipeline stats top bar */}
        {stats && (
          <div className="flex flex-wrap gap-4 mb-6">
            <div
              className="rounded-xl px-4 py-3"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            >
              <span className="text-2xl font-bold" style={{ color: "var(--cyan)", fontFeatureSettings: "'tnum'" }}>
                {stats.total}
              </span>
              <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>Total</span>
            </div>
            {STAGES.map(({ key, label, color }) => (
              <div
                key={key}
                className="rounded-xl px-4 py-3"
                style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
              >
                <span className="text-2xl font-bold" style={{ color, fontFeatureSettings: "'tnum'" }}>
                  {stats[key as keyof PipelineStats] ?? 0}
                </span>
                <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Search filter */}
        <div className="flex items-center gap-4 mb-6">
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Pipeline
          </h1>
          <div className="flex-1 max-w-sm">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter by name or company..."
              className="w-full text-sm bg-transparent px-4 py-2 rounded-lg outline-none"
              style={{
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        </div>

        {/* Kanban columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {STAGES.map(({ key, label, color }) => {
            const columnEntries = filteredEntries.filter((e) => e.stage === key);
            return (
              <div key={key} className="min-w-0">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                    {label}
                  </h3>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)" }}
                  >
                    {columnEntries.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {columnEntries.map((entry) => (
                    <PipelineCard
                      key={entry.pipeline_id}
                      entry={entry}
                      onStageChange={handleStageChange}
                      onRatingChange={handleRatingChange}
                    />
                  ))}
                  {columnEntries.length === 0 && (
                    <div
                      className="rounded-lg p-4 text-center"
                      style={{ backgroundColor: "var(--bg-surface)", border: "1px dashed var(--border-subtle)" }}
                    >
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Empty</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Rejected/Withdrawn toggle */}
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowRejected(!showRejected)}
            className="text-xs font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            {showRejected ? "Hide" : "Show"} Rejected / Withdrawn ({filteredEntries.filter((e) => e.stage === "rejected" || e.stage === "withdrawn").length})
          </button>
          {showRejected && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              {filteredEntries
                .filter((e) => e.stage === "rejected" || e.stage === "withdrawn")
                .map((entry) => (
                  <PipelineCard
                    key={entry.pipeline_id}
                    entry={entry}
                    onStageChange={handleStageChange}
                    onRatingChange={handleRatingChange}
                  />
                ))}
            </div>
          )}
        </div>
      </div>

      <MobileNav />
    </div>
  );
}
