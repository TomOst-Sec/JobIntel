"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

/* ── Types ───────────────────────────────────────────── */

interface Skill {
  name: string;
  depth: number; // 1-5
  category?: string;
}

interface Experience {
  company: string;
  title: string;
  start_date: string;
  end_date: string | null;
  duration_months: number;
}

interface CvDna {
  id: number;
  headline: string;
  summary: string;
  skills: Skill[];
  experience: Experience[];
  market_position_score: number | null;
  hidden_strengths: string[] | null;
  enriched: boolean;
}

interface TailoredResult {
  id: number;
  job_id: number;
  tailoring_level: string;
  match_score_before: number;
  match_score_after: number;
  ats_score: number;
  keywords_added: string[];
  changes: string[];
  created_at: string;
}

interface CoverLetter {
  id: number;
  job_id: number;
  tone: string;
  content: string;
  personalization_hooks: string[];
  created_at: string;
}

interface ApplicationStats {
  total: number;
  response_rate: number;
  active: number;
  offers: number;
}

interface Application {
  id: number;
  company: string;
  title: string;
  status: string;
  match_score: number;
  ghost_score: number;
  applied_at: string;
}

type TabId = "cv" | "tailor" | "cover" | "apps";
type TailoringLevel = "quick" | "standard" | "full" | "max";
type Tone = "professional" | "casual" | "technical" | "startup";

/* ── Helpers ─────────────────────────────────────────── */

function skillColor(depth: number): { color: string; bg: string } {
  const map: Record<number, { color: string; bg: string }> = {
    1: { color: "var(--text-muted)", bg: "var(--bg-surface)" },
    2: { color: "var(--cyan)", bg: "var(--cyan-15)" },
    3: { color: "var(--green)", bg: "var(--green-15)" },
    4: { color: "var(--gold)", bg: "var(--gold-15)" },
    5: { color: "var(--red)", bg: "var(--red-15)" },
  };
  return map[depth] || map[1];
}

function statusColor(status: string): { color: string; bg: string } {
  const map: Record<string, { color: string; bg: string }> = {
    applied: { color: "var(--cyan)", bg: "var(--cyan-15)" },
    viewed: { color: "var(--gold)", bg: "var(--gold-15)" },
    phone_screen: { color: "var(--green)", bg: "var(--green-15)" },
    technical: { color: "var(--green)", bg: "var(--green-15)" },
    onsite: { color: "var(--green)", bg: "var(--green-15)" },
    offer: { color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
    rejected: { color: "var(--red)", bg: "var(--red-15)" },
    ghosted: { color: "rgba(239,68,68,0.6)", bg: "rgba(239,68,68,0.08)" },
    withdrawn: { color: "var(--text-muted)", bg: "var(--bg-surface)" },
  };
  return map[status] || { color: "var(--text-muted)", bg: "var(--bg-surface)" };
}

function gaugeColor(score: number): string {
  if (score >= 75) return "var(--green)";
  if (score >= 50) return "var(--gold)";
  if (score >= 25) return "var(--cyan)";
  return "var(--red)";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ── Component ───────────────────────────────────────── */

export default function CvIntelligencePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<TabId>("cv");
  const [error, setError] = useState("");

  /* -- My CV state -- */
  const [cvDna, setCvDna] = useState<CvDna | null>(null);
  const [cvLoading, setCvLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* -- Tailor state -- */
  const [tailorJobId, setTailorJobId] = useState("");
  const [tailoringLevel, setTailoringLevel] = useState<TailoringLevel>("standard");
  const [tailoring, setTailoring] = useState(false);
  const [tailorResult, setTailorResult] = useState<TailoredResult | null>(null);
  const [tailorHistory, setTailorHistory] = useState<TailoredResult[]>([]);

  /* -- Cover Letters state -- */
  const [coverJobId, setCoverJobId] = useState("");
  const [coverTone, setCoverTone] = useState<Tone>("professional");
  const [generating, setGenerating] = useState(false);
  const [coverResult, setCoverResult] = useState<CoverLetter | null>(null);
  const [coverHistory, setCoverHistory] = useState<CoverLetter[]>([]);

  /* -- Applications state -- */
  const [appStats, setAppStats] = useState<ApplicationStats | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [appsLoading, setAppsLoading] = useState(false);

  /* ── Auth guard ─────────────────────────────────────── */

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  /* ── Initial data loaders ──────────────────────────── */

  useEffect(() => {
    api.get<CvDna>("/cv-intelligence/dna")
      .then(setCvDna)
      .catch(() => {});
  }, []);

  const loadTailorHistory = useCallback(async () => {
    try {
      const data = await api.get<TailoredResult[]>("/cv-intelligence/tailored");
      setTailorHistory(data);
    } catch { /* ignore */ }
  }, []);

  const loadCoverHistory = useCallback(async () => {
    try {
      const data = await api.get<CoverLetter[]>("/cv-intelligence/cover-letters");
      setCoverHistory(data);
    } catch { /* ignore */ }
  }, []);

  const loadAppStats = useCallback(async () => {
    try {
      const data = await api.get<ApplicationStats>("/cv-intelligence/applications/stats");
      setAppStats(data);
    } catch { /* ignore */ }
  }, []);

  const loadApplications = useCallback(async (status: string) => {
    setAppsLoading(true);
    try {
      const qs = status && status !== "all" ? `?status=${status}` : "";
      const data = await api.get<Application[]>(`/cv-intelligence/applications${qs}`);
      setApplications(data);
    } catch { /* ignore */ }
    finally { setAppsLoading(false); }
  }, []);

  /* Load tab-specific data on tab switch */
  useEffect(() => {
    if (tab === "tailor") loadTailorHistory();
    if (tab === "cover") loadCoverHistory();
    if (tab === "apps") {
      loadAppStats();
      loadApplications(statusFilter);
    }
  }, [tab, loadTailorHistory, loadCoverHistory, loadAppStats, loadApplications, statusFilter]);

  /* ── Actions ───────────────────────────────────────── */

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const result = await api.upload<CvDna>("/cv-intelligence/upload", file);
      setCvDna(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleParseText = async () => {
    if (!pasteText.trim()) return;
    setCvLoading(true);
    setError("");
    try {
      const result = await api.post<CvDna>("/cv-intelligence/parse-text", { text: pasteText });
      setCvDna(result);
      setPasteText("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setCvLoading(false);
    }
  };

  const handleEnrich = async () => {
    setEnriching(true);
    setError("");
    try {
      const result = await api.post<CvDna>("/cv-intelligence/enrich");
      setCvDna(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Enrichment failed");
    } finally {
      setEnriching(false);
    }
  };

  const handleTailor = async () => {
    if (!tailorJobId.trim()) return;
    setTailoring(true);
    setError("");
    try {
      const result = await api.post<TailoredResult>("/cv-intelligence/tailor", {
        job_id: parseInt(tailorJobId, 10),
        tailoring_level: tailoringLevel,
      });
      setTailorResult(result);
      loadTailorHistory();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Tailoring failed");
    } finally {
      setTailoring(false);
    }
  };

  const handleGenerateCover = async () => {
    if (!coverJobId.trim()) return;
    setGenerating(true);
    setError("");
    try {
      const result = await api.post<CoverLetter>("/cv-intelligence/cover-letter", {
        job_id: parseInt(coverJobId, 10),
        tone: coverTone,
      });
      setCoverResult(result);
      loadCoverHistory();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  /* ── Render guard ──────────────────────────────────── */

  if (authLoading || !user) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: "cv", label: "My CV" },
    { id: "tailor", label: "Tailor" },
    { id: "cover", label: "Cover Letters" },
    { id: "apps", label: "Applications" },
  ];

  const tailoringLevels: { value: TailoringLevel; label: string; desc: string }[] = [
    { value: "quick", label: "Quick", desc: "Keywords only" },
    { value: "standard", label: "Standard", desc: "Keywords + reorder" },
    { value: "full", label: "Full", desc: "Rewrite bullets" },
    { value: "max", label: "Max", desc: "Full restructure" },
  ];

  const tones: { value: Tone; label: string }[] = [
    { value: "professional", label: "Professional" },
    { value: "casual", label: "Casual" },
    { value: "technical", label: "Technical" },
    { value: "startup", label: "Startup" },
  ];

  const statusFilters = ["all", "applied", "viewed", "phone_screen", "technical", "onsite", "offer", "rejected", "ghosted", "withdrawn"];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-deep)" }}>
      <TopNav />
      <main className="max-w-6xl mx-auto px-4 pt-20 pb-28 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            CV Intelligence
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Parse, enrich, tailor your CV and track applications with AI precision
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--bg-surface)" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setError(""); }}
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

        {/* Error banner */}
        {error && (
          <div className="p-3 rounded-lg text-sm" style={{ background: "var(--red-15)", color: "var(--red)" }}>
            {error}
          </div>
        )}

        {/* ════════════════════════════════════════════════ */}
        {/* TAB 1: My CV                                    */}
        {/* ════════════════════════════════════════════════ */}
        {tab === "cv" && (
          <div className="space-y-6">
            {/* Upload zone (always visible so user can re-upload) */}
            {!cvDna && (
              <div className="space-y-4">
                {/* Drag-and-drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-3 p-10 rounded-xl cursor-pointer transition-all"
                  style={{
                    border: `2px dashed ${dragOver ? "var(--cyan)" : "var(--border-default)"}`,
                    background: dragOver ? "var(--cyan-08)" : "var(--bg-surface)",
                  }}
                >
                  <svg className="w-10 h-10" viewBox="0 0 40 40" fill="none" style={{ color: "var(--text-muted)" }}>
                    <path d="M20 6v20M12 14l8-8 8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M6 28v4a2 2 0 002 2h24a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {uploading ? "Uploading..." : "Drop your CV here (PDF or DOCX)"}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    or click to browse files
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                </div>

                {/* Paste text area */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                    Or paste your CV text
                  </p>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={8}
                    placeholder="Paste your CV/resume content here..."
                    className="w-full px-4 py-3 rounded-xl text-sm resize-y"
                    style={{
                      background: "var(--bg-surface)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  />
                  <button
                    onClick={handleParseText}
                    disabled={cvLoading || !pasteText.trim()}
                    className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      background: pasteText.trim() ? "var(--cyan)" : "var(--bg-elevated)",
                      color: pasteText.trim() ? "var(--text-inverse)" : "var(--text-muted)",
                      opacity: cvLoading ? 0.6 : 1,
                    }}
                  >
                    {cvLoading ? "Parsing..." : "Parse Text"}
                  </button>
                </div>
              </div>
            )}

            {/* CV DNA Card */}
            {cvDna && (
              <div className="space-y-4">
                <div
                  className="rounded-xl p-6 space-y-5"
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    boxShadow: "var(--shadow-card)",
                  }}
                >
                  {/* Headline and actions */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                        {cvDna.headline || "Your CV DNA"}
                      </h2>
                      <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        {cvDna.summary}
                      </p>
                    </div>

                    {/* Market Position Gauge */}
                    {cvDna.market_position_score != null && (
                      <div className="flex-shrink-0 flex flex-col items-center">
                        <div className="relative w-20 h-20">
                          <svg viewBox="0 0 80 80" className="w-full h-full">
                            <circle
                              cx="40" cy="40" r="34"
                              fill="none"
                              stroke="var(--border-subtle)"
                              strokeWidth="6"
                            />
                            <circle
                              cx="40" cy="40" r="34"
                              fill="none"
                              stroke={gaugeColor(cvDna.market_position_score)}
                              strokeWidth="6"
                              strokeLinecap="round"
                              strokeDasharray={`${(cvDna.market_position_score / 100) * 213.6} 213.6`}
                              transform="rotate(-90 40 40)"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span
                              className="text-lg font-bold font-mono"
                              style={{ color: gaugeColor(cvDna.market_position_score) }}
                            >
                              {cvDna.market_position_score}
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] mt-1 font-medium" style={{ color: "var(--text-muted)" }}>
                          Market Position
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Skills pills */}
                  <div>
                    <h3 className="text-xs font-semibold tracking-wide uppercase mb-2" style={{ color: "var(--text-muted)" }}>
                      Skills
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {cvDna.skills.map((skill, i) => {
                        const sc = skillColor(skill.depth);
                        return (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                            style={{ background: sc.bg, color: sc.color }}
                          >
                            {skill.name}
                            <span className="text-[9px] opacity-70">L{skill.depth}</span>
                          </span>
                        );
                      })}
                      {cvDna.skills.length === 0 && (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>No skills parsed yet</span>
                      )}
                    </div>
                  </div>

                  {/* Experience timeline */}
                  <div>
                    <h3 className="text-xs font-semibold tracking-wide uppercase mb-2" style={{ color: "var(--text-muted)" }}>
                      Experience
                    </h3>
                    <div className="space-y-3">
                      {cvDna.experience.map((exp, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 pl-3"
                          style={{ borderLeft: `2px solid ${i === 0 ? "var(--cyan)" : "var(--border-subtle)"}` }}
                        >
                          <div className="flex-1">
                            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                              {exp.title}
                            </p>
                            <p className="text-xs" style={{ color: "var(--cyan)" }}>{exp.company}</p>
                          </div>
                          <span className="text-xs font-mono shrink-0" style={{ color: "var(--text-muted)" }}>
                            {exp.duration_months >= 12
                              ? `${Math.floor(exp.duration_months / 12)}y ${exp.duration_months % 12}m`
                              : `${exp.duration_months}m`}
                          </span>
                        </div>
                      ))}
                      {cvDna.experience.length === 0 && (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>No experience parsed yet</span>
                      )}
                    </div>
                  </div>

                  {/* Hidden Strengths (if enriched) */}
                  {cvDna.enriched && cvDna.hidden_strengths && cvDna.hidden_strengths.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold tracking-wide uppercase mb-2" style={{ color: "var(--green)" }}>
                        Hidden Strengths Discovered
                      </h3>
                      <div className="space-y-1.5">
                        {cvDna.hidden_strengths.map((s, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                            style={{ background: "var(--green-15)", color: "var(--green)" }}
                          >
                            <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none">
                              <path d="M3 8l4 4 6-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {s}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Enrich button */}
                  {!cvDna.enriched && (
                    <button
                      onClick={handleEnrich}
                      disabled={enriching}
                      className="w-full py-3 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        background: "linear-gradient(135deg, var(--cyan), var(--green))",
                        color: "var(--text-inverse)",
                        opacity: enriching ? 0.6 : 1,
                      }}
                    >
                      {enriching ? "Enriching with Market Intelligence..." : "Enrich with Market Intelligence"}
                    </button>
                  )}
                </div>

                {/* Re-upload trigger */}
                <button
                  onClick={() => setCvDna(null)}
                  className="text-xs underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Upload a different CV
                </button>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════ */}
        {/* TAB 2: Tailor                                   */}
        {/* ════════════════════════════════════════════════ */}
        {tab === "tailor" && (
          <div className="space-y-6">
            {/* Input controls */}
            <div
              className="rounded-xl p-5 space-y-4"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Tailor CV for a Job
              </h3>

              {/* Job ID input */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>
                  Job ID
                </label>
                <input
                  value={tailorJobId}
                  onChange={(e) => setTailorJobId(e.target.value)}
                  placeholder="Enter job ID"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: "var(--bg-elevated)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-subtle)",
                  }}
                />
              </div>

              {/* Tailoring level radio buttons */}
              <div>
                <label className="text-xs font-medium mb-2 block" style={{ color: "var(--text-muted)" }}>
                  Tailoring Level
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {tailoringLevels.map((lvl) => (
                    <button
                      key={lvl.value}
                      onClick={() => setTailoringLevel(lvl.value)}
                      className="p-3 rounded-lg text-left transition-all"
                      style={{
                        background: tailoringLevel === lvl.value ? "var(--cyan-15)" : "var(--bg-elevated)",
                        border: `1px solid ${tailoringLevel === lvl.value ? "var(--cyan)" : "var(--border-subtle)"}`,
                      }}
                    >
                      <p
                        className="text-sm font-semibold"
                        style={{ color: tailoringLevel === lvl.value ? "var(--cyan)" : "var(--text-primary)" }}
                      >
                        {lvl.label}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {lvl.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tailor button */}
              <button
                onClick={handleTailor}
                disabled={tailoring || !tailorJobId.trim()}
                className="w-full py-3 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: tailorJobId.trim() ? "var(--cyan)" : "var(--bg-elevated)",
                  color: tailorJobId.trim() ? "var(--text-inverse)" : "var(--text-muted)",
                  opacity: tailoring ? 0.6 : 1,
                }}
              >
                {tailoring ? "Tailoring..." : "Tailor CV"}
              </button>
            </div>

            {/* Tailored result */}
            {tailorResult && (
              <div
                className="rounded-xl p-5 space-y-4"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Tailoring Results
                </h3>

                {/* Score comparison */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg text-center" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[10px] uppercase font-semibold tracking-wide" style={{ color: "var(--text-muted)" }}>Before</p>
                    <p className="text-2xl font-bold font-mono" style={{ color: "var(--text-muted)" }}>
                      {tailorResult.match_score_before}%
                    </p>
                  </div>
                  <div className="p-3 rounded-lg text-center" style={{ background: "var(--green-15)" }}>
                    <p className="text-[10px] uppercase font-semibold tracking-wide" style={{ color: "var(--green)" }}>After</p>
                    <p className="text-2xl font-bold font-mono" style={{ color: "var(--green)" }}>
                      {tailorResult.match_score_after}%
                    </p>
                  </div>
                  <div className="p-3 rounded-lg text-center" style={{ background: "var(--cyan-15)" }}>
                    <p className="text-[10px] uppercase font-semibold tracking-wide" style={{ color: "var(--cyan)" }}>ATS Score</p>
                    <p className="text-2xl font-bold font-mono" style={{ color: "var(--cyan)" }}>
                      {tailorResult.ats_score}%
                    </p>
                  </div>
                </div>

                {/* Keywords added */}
                {tailorResult.keywords_added.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold tracking-wide uppercase mb-1.5" style={{ color: "var(--text-muted)" }}>
                      Keywords Added
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {tailorResult.keywords_added.map((kw, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-full text-xs font-medium"
                          style={{ background: "var(--green-15)", color: "var(--green)" }}
                        >
                          + {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Changes made */}
                {tailorResult.changes.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold tracking-wide uppercase mb-1.5" style={{ color: "var(--text-muted)" }}>
                      Changes Made
                    </p>
                    <ul className="space-y-1">
                      {tailorResult.changes.map((c, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                          <span style={{ color: "var(--cyan)" }} className="shrink-0 mt-0.5">&#8226;</span>
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Tailoring history */}
            {tailorHistory.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                  Previous Tailored Versions
                </h3>
                {tailorHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 p-3 rounded-xl"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        Job #{item.job_id}
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {item.tailoring_level} &middot; {formatDate(item.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span style={{ color: "var(--text-muted)" }}>{item.match_score_before}%</span>
                      <span style={{ color: "var(--text-muted)" }}>&rarr;</span>
                      <span style={{ color: "var(--green)" }}>{item.match_score_after}%</span>
                    </div>
                    <span
                      className="text-xs px-2 py-0.5 rounded"
                      style={{ background: "var(--cyan-15)", color: "var(--cyan)" }}
                    >
                      ATS {item.ats_score}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════ */}
        {/* TAB 3: Cover Letters                            */}
        {/* ════════════════════════════════════════════════ */}
        {tab === "cover" && (
          <div className="space-y-6">
            {/* Input controls */}
            <div
              className="rounded-xl p-5 space-y-4"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Generate Cover Letter
              </h3>

              {/* Job ID */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>
                  Job ID
                </label>
                <input
                  value={coverJobId}
                  onChange={(e) => setCoverJobId(e.target.value)}
                  placeholder="Enter job ID"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: "var(--bg-elevated)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-subtle)",
                  }}
                />
              </div>

              {/* Tone selector */}
              <div>
                <label className="text-xs font-medium mb-2 block" style={{ color: "var(--text-muted)" }}>
                  Tone
                </label>
                <div className="flex gap-2 flex-wrap">
                  {tones.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setCoverTone(t.value)}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                      style={{
                        background: coverTone === t.value ? "var(--cyan-15)" : "var(--bg-elevated)",
                        color: coverTone === t.value ? "var(--cyan)" : "var(--text-secondary)",
                        border: `1px solid ${coverTone === t.value ? "var(--cyan)" : "var(--border-subtle)"}`,
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate button */}
              <button
                onClick={handleGenerateCover}
                disabled={generating || !coverJobId.trim()}
                className="w-full py-3 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: coverJobId.trim() ? "var(--cyan)" : "var(--bg-elevated)",
                  color: coverJobId.trim() ? "var(--text-inverse)" : "var(--text-muted)",
                  opacity: generating ? 0.6 : 1,
                }}
              >
                {generating ? "Generating..." : "Generate"}
              </button>
            </div>

            {/* Generated cover letter */}
            {coverResult && (
              <div
                className="rounded-xl p-6 space-y-4"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    Cover Letter
                  </h3>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: "var(--cyan-15)", color: "var(--cyan)" }}
                  >
                    {coverResult.tone}
                  </span>
                </div>
                <div
                  className="text-sm leading-relaxed whitespace-pre-wrap"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {coverResult.content.split(/(\{[^}]+\})/).map((part, i) => {
                    const isHook = coverResult.personalization_hooks.some(
                      (hook) => part.includes(hook)
                    );
                    return isHook ? (
                      <span
                        key={i}
                        className="px-1 py-0.5 rounded"
                        style={{ background: "var(--gold-15)", color: "var(--gold)" }}
                      >
                        {part}
                      </span>
                    ) : (
                      <span key={i}>{part}</span>
                    );
                  })}
                </div>

                {/* Personalization hooks */}
                {coverResult.personalization_hooks.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold tracking-wide uppercase mb-1.5" style={{ color: "var(--text-muted)" }}>
                      Personalization Hooks
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {coverResult.personalization_hooks.map((hook, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-full text-xs font-medium"
                          style={{ background: "var(--gold-15)", color: "var(--gold)" }}
                        >
                          {hook}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Cover letter history */}
            {coverHistory.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                  Previous Cover Letters
                </h3>
                {coverHistory.map((cl) => (
                  <button
                    key={cl.id}
                    onClick={() => setCoverResult(cl)}
                    className="w-full flex items-center gap-4 p-3 rounded-xl text-left transition-all"
                    style={{
                      background: coverResult?.id === cl.id ? "var(--cyan-08)" : "var(--bg-surface)",
                      border: `1px solid ${coverResult?.id === cl.id ? "var(--cyan)" : "var(--border-subtle)"}`,
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        Job #{cl.job_id}
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {formatDate(cl.created_at)}
                      </p>
                    </div>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{ background: "var(--cyan-15)", color: "var(--cyan)" }}
                    >
                      {cl.tone}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════ */}
        {/* TAB 4: Applications                             */}
        {/* ════════════════════════════════════════════════ */}
        {tab === "apps" && (
          <div className="space-y-6">
            {/* Stats cards */}
            {appStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Total</p>
                  <p className="text-2xl font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                    {appStats.total}
                  </p>
                </div>
                <div className="p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Response Rate</p>
                  <p className="text-2xl font-bold font-mono" style={{ color: "var(--cyan)" }}>
                    {appStats.response_rate}%
                  </p>
                </div>
                <div className="p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Active</p>
                  <p className="text-2xl font-bold font-mono" style={{ color: "var(--green)" }}>
                    {appStats.active}
                  </p>
                </div>
                <div className="p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Offers</p>
                  <p className="text-2xl font-bold font-mono" style={{ color: "var(--gold)" }}>
                    {appStats.offers}
                  </p>
                </div>
              </div>
            )}

            {/* Status filter pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {statusFilters.map((sf) => (
                <button
                  key={sf}
                  onClick={() => {
                    setStatusFilter(sf);
                    loadApplications(sf);
                  }}
                  className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0"
                  style={{
                    background: statusFilter === sf ? "var(--cyan-15)" : "var(--bg-surface)",
                    color: statusFilter === sf ? "var(--cyan)" : "var(--text-muted)",
                    border: `1px solid ${statusFilter === sf ? "var(--cyan)" : "var(--border-subtle)"}`,
                  }}
                >
                  {sf === "all" ? "All" : sf.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </button>
              ))}
            </div>

            {/* Application cards */}
            {appsLoading ? (
              <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>Loading applications...</p>
            ) : applications.length > 0 ? (
              <div className="space-y-2">
                {applications.map((app) => {
                  const sc = statusColor(app.status);
                  return (
                    <div
                      key={app.id}
                      className="flex items-center gap-4 p-4 rounded-xl"
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                          {app.title}
                        </p>
                        <p className="text-xs" style={{ color: "var(--cyan)" }}>{app.company}</p>
                        <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                          Applied {formatDate(app.applied_at)}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {/* Status badge */}
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
                          style={{ background: sc.bg, color: sc.color }}
                        >
                          {app.status.replace("_", " ")}
                        </span>

                        {/* Scores */}
                        <div className="flex items-center gap-2 text-[11px] font-mono">
                          <span style={{ color: "var(--green)" }} title="Match score">
                            {app.match_score}% match
                          </span>
                          {app.ghost_score > 0 && (
                            <span style={{ color: "var(--red)" }} title="Ghost probability">
                              {app.ghost_score}% ghost
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
                {statusFilter === "all"
                  ? "No applications tracked yet. Start applying to jobs to see them here."
                  : `No applications with status "${statusFilter.replace("_", " ")}".`}
              </p>
            )}
          </div>
        )}
      </main>
      <MobileNav />
    </div>
  );
}
