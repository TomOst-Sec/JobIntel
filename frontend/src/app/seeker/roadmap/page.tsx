"use client";

import { useState, useEffect, useMemo, useCallback, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillGap {
  skill: string;
  priority: string; // "critical" | "high" | "medium" | "low"
  market_demand_pct?: number;
  current_level?: string;
  target_level?: string;
}

interface Phase {
  phase: number;
  title: string;
  duration_weeks: number;
  focus: string;
  tasks: { task: string; resource: string; hours: number; priority: string }[];
  milestone: string;
}

interface Roadmap {
  id?: number;
  target_role: string;
  current_match_score?: number | null;
  projected_match_score?: number | null;
  timeline_weeks?: number | null;
  honest_assessment?: string | null;
  skill_gaps?: SkillGap[];
  phases?: Phase[];
  recommended_roles_progression?: string[];
  salary_trajectory?: {
    current_estimated?: number;
    after_roadmap?: number;
    target_role_range?: number[];
  };
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function sortByPriority(gaps: SkillGap[]): SkillGap[] {
  return [...gaps].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
  );
}

function priorityColor(p: string): { bg: string; text: string } {
  switch (p) {
    case "critical":
      return { bg: "var(--red-15)", text: "var(--red)" };
    case "high":
      return { bg: "var(--gold-15)", text: "#ff8800" };
    case "medium":
      return { bg: "var(--gold-08)", text: "var(--gold)" };
    case "low":
      return { bg: "var(--green-08)", text: "var(--green)" };
    default:
      return { bg: "var(--cyan-08)", text: "var(--cyan)" };
  }
}

function scoreColor(score: number): string {
  if (score >= 70) return "var(--green)";
  if (score >= 40) return "var(--gold)";
  return "var(--red)";
}

function formatCurrency(value: number): string {
  return "$" + value.toLocaleString("en-US");
}

function levelToPercent(level?: string): number {
  switch (level?.toLowerCase()) {
    case "none":
      return 0;
    case "beginner":
      return 20;
    case "basic":
      return 30;
    case "intermediate":
      return 50;
    case "advanced":
      return 75;
    case "expert":
      return 100;
    default:
      return 25;
  }
}

// ---------------------------------------------------------------------------
// SVG Components
// ---------------------------------------------------------------------------

function CompassIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <polygon
        points="12,2 14.5,9.5 12,8 9.5,9.5"
        fill="currentColor"
        opacity="0.6"
      />
      <polygon
        points="12,22 9.5,14.5 12,16 14.5,14.5"
        fill="currentColor"
        opacity="0.3"
      />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

function CalendarIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 8h14" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 2v4M13 2v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ArrowRightIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronLeftIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M10 12L6 8l4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8l4 4 6-8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MinusIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 8h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Circular Progress Ring
// ---------------------------------------------------------------------------

function ProgressRing({
  value,
  size = 100,
  stroke = 8,
  color,
  label,
  sublabel,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color: string;
  label: string;
  sublabel: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth={stroke}
          />
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
          />
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-2xl font-display tabular-nums"
            style={{ color }}
          >
            {value}%
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {label}
        </p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {sublabel}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skill Tag Input
// ---------------------------------------------------------------------------

function SkillTagInput({
  skills,
  onChange,
}: {
  skills: string[];
  onChange: (skills: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const addSkill = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed && !skills.includes(trimmed)) {
        onChange([...skills, trimmed]);
      }
      setInput("");
    },
    [skills, onChange]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill(input);
    }
    if (e.key === "Backspace" && input === "" && skills.length > 0) {
      onChange(skills.slice(0, -1));
    }
  };

  const handleBlur = () => {
    if (input.trim()) {
      // Handle comma-separated pasting
      const parts = input.split(",").map((s) => s.trim()).filter(Boolean);
      const newSkills = [...skills];
      for (const part of parts) {
        if (!newSkills.includes(part)) {
          newSkills.push(part);
        }
      }
      onChange(newSkills);
      setInput("");
    }
  };

  const removeSkill = (idx: number) => {
    onChange(skills.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <div
        className="flex flex-wrap items-center gap-1.5 min-h-[42px] rounded-lg px-3 py-2"
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {skills.map((skill, idx) => (
          <span
            key={skill}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
            style={{
              backgroundColor: "var(--cyan-15)",
              color: "var(--cyan)",
              border: "1px solid var(--cyan-40)",
            }}
          >
            {skill}
            <button
              type="button"
              onClick={() => removeSkill(idx)}
              className="ml-0.5 hover:opacity-70 transition-opacity"
              aria-label={`Remove ${skill}`}
            >
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={skills.length === 0 ? "Type a skill and press Enter..." : ""}
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none"
          style={{ color: "var(--text-primary)" }}
          aria-label="Add a skill"
        />
      </div>
      <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
        Press Enter or comma to add. Backspace to remove last.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function RoadmapPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Data state
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [active, setActive] = useState<Roadmap | null>(null);
  const [loadingRoadmaps, setLoadingRoadmaps] = useState(true);

  // Generator state
  const [generating, setGenerating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [targetRole, setTargetRole] = useState("");
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const [experienceYears, setExperienceYears] = useState(0);
  const [error, setError] = useState("");

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Fetch roadmaps on mount
  useEffect(() => {
    setLoadingRoadmaps(true);
    api
      .get<Roadmap[]>("/roadmap")
      .then(setRoadmaps)
      .catch(() => {})
      .finally(() => setLoadingRoadmaps(false));
  }, []);

  // Generate roadmap
  const generateRoadmap = async () => {
    if (!targetRole.trim()) return;
    setGenerating(true);
    setError("");
    try {
      const result = await api.post<Roadmap>("/roadmap", {
        target_role: targetRole.trim(),
        user_skills: userSkills,
        experience_years: experienceYears,
      });
      setActive(result);
      setRoadmaps((prev) => [result, ...prev]);
      setFormOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate roadmap");
    }
    setGenerating(false);
  };

  // Auth loading guard
  if (authLoading || !user) return null;

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: "var(--bg-deep)" }}
    >
      <TopNav />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-8">
        {!active ? (
          <ListView
            roadmaps={roadmaps}
            loadingRoadmaps={loadingRoadmaps}
            formOpen={formOpen}
            setFormOpen={setFormOpen}
            targetRole={targetRole}
            setTargetRole={setTargetRole}
            userSkills={userSkills}
            setUserSkills={setUserSkills}
            experienceYears={experienceYears}
            setExperienceYears={setExperienceYears}
            generating={generating}
            error={error}
            onGenerate={generateRoadmap}
            onSelect={setActive}
          />
        ) : (
          <DetailView roadmap={active} onBack={() => setActive(null)} />
        )}
      </main>

      <MobileNav />
    </div>
  );
}

// ---------------------------------------------------------------------------
// List View
// ---------------------------------------------------------------------------

function ListView({
  roadmaps,
  loadingRoadmaps,
  formOpen,
  setFormOpen,
  targetRole,
  setTargetRole,
  userSkills,
  setUserSkills,
  experienceYears,
  setExperienceYears,
  generating,
  error,
  onGenerate,
  onSelect,
}: {
  roadmaps: Roadmap[];
  loadingRoadmaps: boolean;
  formOpen: boolean;
  setFormOpen: (v: boolean) => void;
  targetRole: string;
  setTargetRole: (v: string) => void;
  userSkills: string[];
  setUserSkills: (v: string[]) => void;
  experienceYears: number;
  setExperienceYears: (v: number) => void;
  generating: boolean;
  error: string;
  onGenerate: () => void;
  onSelect: (r: Roadmap) => void;
}) {
  return (
    <div className="space-y-8 animate-fade-up">
      {/* Hero Card */}
      <div className="card p-8 relative overflow-hidden">
        {/* Ambient glow */}
        <div
          className="absolute -top-20 -right-20 w-[300px] h-[300px] pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(0, 212, 255, 0.06) 0%, transparent 70%)",
          }}
          aria-hidden="true"
        />

        <div className="relative flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="flex items-start gap-4 flex-1">
            {/* Icon badge */}
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: "var(--cyan-15)",
                border: "1px solid var(--cyan-40)",
                color: "var(--cyan)",
              }}
            >
              <CompassIcon className="w-6 h-6" />
            </div>

            <div>
              <h1
                className="text-2xl font-display"
                style={{ color: "var(--text-primary)" }}
              >
                Career Roadmap
              </h1>
              <p
                className="text-sm mt-1 max-w-lg"
                style={{ color: "var(--text-secondary)" }}
              >
                AI-powered skill gap analysis with market-data-backed learning paths
              </p>
            </div>
          </div>

          <Button
            variant="primary"
            size="lg"
            onClick={() => setFormOpen(!formOpen)}
            className="shrink-0"
          >
            <PlusIcon className="w-4 h-4" />
            Generate Roadmap
          </Button>
        </div>
      </div>

      {/* Generator Form */}
      {formOpen && (
        <div className="card p-6 animate-fade-up">
          <h2
            className="text-lg font-display mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            Generate Your Roadmap
          </h2>
          <p className="text-xs mb-6" style={{ color: "var(--text-muted)" }}>
            Tell us your target role and current skills. We will analyze the market and build a personalized plan.
          </p>

          <div className="space-y-5">
            {/* Target Role */}
            <div>
              <label
                htmlFor="target-role"
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                Target Role <span style={{ color: "var(--red)" }}>*</span>
              </label>
              <input
                id="target-role"
                type="text"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g. Senior DevOps Engineer"
                className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
                autoFocus
              />
            </div>

            {/* Skills */}
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                Current Skills
              </label>
              <SkillTagInput skills={userSkills} onChange={setUserSkills} />
            </div>

            {/* Experience Years */}
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                Years of Experience
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setExperienceYears(Math.max(0, experienceYears - 1))}
                  className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                  aria-label="Decrease years"
                >
                  <MinusIcon className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  value={experienceYears}
                  onChange={(e) =>
                    setExperienceYears(
                      Math.max(0, Math.min(40, parseInt(e.target.value) || 0))
                    )
                  }
                  min={0}
                  max={40}
                  className="w-16 text-center rounded-lg px-3 py-2 text-sm font-mono outline-none tabular-nums"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                  aria-label="Years of experience"
                />
                <button
                  type="button"
                  onClick={() => setExperienceYears(Math.min(40, experienceYears + 1))}
                  className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                  aria-label="Increase years"
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  years
                </span>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
                style={{
                  backgroundColor: "var(--red-08)",
                  border: "1px solid var(--red-15)",
                  color: "var(--red)",
                }}
                role="alert"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M8 5v4M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                {error}
              </div>
            )}

            {/* Submit */}
            <div className="flex items-center gap-3 pt-1">
              <Button
                variant="primary"
                size="md"
                onClick={onGenerate}
                disabled={generating || !targetRole.trim()}
                loading={generating}
              >
                {generating ? "Analyzing market data..." : "Generate Roadmap"}
              </Button>
              <Button variant="ghost" size="md" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Previous Roadmaps */}
      {loadingRoadmaps ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="card shimmer rounded-xl"
              style={{ height: "160px" }}
            />
          ))}
        </div>
      ) : roadmaps.length > 0 ? (
        <div>
          <h2
            className="text-sm font-semibold uppercase tracking-wider mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            Previous Roadmaps
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {roadmaps.map((r) => (
              <RoadmapCard key={r.id} roadmap={r} onClick={() => onSelect(r)} />
            ))}
          </div>
        </div>
      ) : !formOpen ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{
              backgroundColor: "var(--cyan-08)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            <CompassIcon className="w-8 h-8" />
          </div>
          <h3
            className="text-lg font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            No roadmaps yet
          </h3>
          <p
            className="text-sm max-w-sm mb-6"
            style={{ color: "var(--text-secondary)" }}
          >
            Generate your first career roadmap to get a personalized skill gap analysis
            and learning path.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setFormOpen(true)}>
            Get Started
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roadmap Card (List View)
// ---------------------------------------------------------------------------

function RoadmapCard({
  roadmap,
  onClick,
}: {
  roadmap: Roadmap;
  onClick: () => void;
}) {
  const score = roadmap.current_match_score;
  const color = score != null ? scoreColor(score) : "var(--text-muted)";

  return (
    <button
      type="button"
      onClick={onClick}
      className="card p-5 text-left w-full group"
    >
      <div className="flex items-start gap-4">
        {/* Mini ring */}
        {score != null && (
          <div className="shrink-0">
            <svg width="48" height="48" className="-rotate-90">
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke="var(--border-subtle)"
                strokeWidth="4"
              />
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke={color}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 20}
                strokeDashoffset={2 * Math.PI * 20 - (score / 100) * 2 * Math.PI * 20}
                style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
              />
            </svg>
            <p
              className="text-center text-[11px] font-mono font-medium -mt-8 relative z-10"
              style={{ color }}
            >
              {score}%
            </p>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3
            className="text-sm font-semibold truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {roadmap.target_role}
          </h3>

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {roadmap.timeline_weeks != null && (
              <span
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                {roadmap.timeline_weeks}w
              </span>
            )}
            {roadmap.created_at && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {new Date(roadmap.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Detail View
// ---------------------------------------------------------------------------

function DetailView({
  roadmap,
  onBack,
}: {
  roadmap: Roadmap;
  onBack: () => void;
}) {
  const sortedGaps = useMemo(
    () => (roadmap.skill_gaps ? sortByPriority(roadmap.skill_gaps) : []),
    [roadmap.skill_gaps]
  );

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Back + Header */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium mb-4 transition-colors duration-200"
          style={{ color: "var(--text-secondary)" }}
        >
          <ChevronLeftIcon className="w-4 h-4" />
          Back to Roadmaps
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1
              className="text-2xl sm:text-3xl font-display"
              style={{ color: "var(--text-primary)" }}
            >
              {roadmap.target_role}
            </h1>
            {roadmap.created_at && (
              <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                Generated{" "}
                {new Date(roadmap.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Score Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {roadmap.current_match_score != null && (
          <div className="card p-6 flex justify-center">
            <ProgressRing
              value={roadmap.current_match_score}
              color={scoreColor(roadmap.current_match_score)}
              label="Current Match"
              sublabel="Where you are now"
            />
          </div>
        )}
        {roadmap.projected_match_score != null && (
          <div className="card p-6 flex justify-center">
            <ProgressRing
              value={roadmap.projected_match_score}
              color="var(--green)"
              label="Projected Match"
              sublabel="After completing roadmap"
            />
          </div>
        )}
        {roadmap.timeline_weeks != null && (
          <div className="card p-6 flex flex-col items-center justify-center gap-2">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: "var(--cyan-08)",
                border: "1px solid var(--border-subtle)",
                color: "var(--cyan)",
              }}
            >
              <CalendarIcon className="w-6 h-6" />
            </div>
            <div className="text-center">
              <p className="text-3xl font-display tabular-nums" style={{ color: "var(--cyan)" }}>
                {roadmap.timeline_weeks}
              </p>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                weeks
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Estimated timeline
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Honest Assessment */}
      {roadmap.honest_assessment && (
        <div
          className="card p-6"
          style={{ borderLeft: "3px solid var(--cyan)" }}
        >
          <h2
            className="text-sm font-semibold uppercase tracking-wider mb-3"
            style={{ color: "var(--text-muted)" }}
          >
            Honest Assessment
          </h2>
          <p
            className="text-sm leading-relaxed whitespace-pre-wrap"
            style={{ color: "var(--text-secondary)" }}
          >
            {roadmap.honest_assessment}
          </p>
        </div>
      )}

      {/* Skill Gap Visualization */}
      {sortedGaps.length > 0 && (
        <div className="card p-6">
          <h2
            className="text-sm font-semibold uppercase tracking-wider mb-5"
            style={{ color: "var(--text-muted)" }}
          >
            Skill Gap Analysis
          </h2>
          <div className="space-y-4">
            {sortedGaps.map((gap, i) => {
              const pColor = priorityColor(gap.priority);
              const currentPct = levelToPercent(gap.current_level);
              const targetPct = levelToPercent(gap.target_level);

              return (
                <div key={i} className="group">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {gap.skill}
                      </span>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide shrink-0"
                        style={{
                          backgroundColor: pColor.bg,
                          color: pColor.text,
                        }}
                      >
                        {gap.priority}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {gap.current_level && gap.target_level && (
                        <span
                          className="text-xs font-mono hidden sm:block"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {gap.current_level} &rarr; {gap.target_level}
                        </span>
                      )}
                      {gap.market_demand_pct != null && (
                        <span
                          className="text-xs font-mono font-medium tabular-nums"
                          style={{ color: "var(--cyan)" }}
                        >
                          {gap.market_demand_pct}% demand
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div
                    className="relative h-2 rounded-full overflow-hidden"
                    style={{ backgroundColor: "var(--bg-overlay)" }}
                  >
                    {/* Target level (faded) */}
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${targetPct}%`,
                        backgroundColor: pColor.bg,
                        transition: "width 0.6s ease-out",
                      }}
                    />
                    {/* Current level (solid) */}
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${currentPct}%`,
                        backgroundColor: pColor.text,
                        transition: "width 0.6s ease-out",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Learning Phases Timeline */}
      {roadmap.phases && roadmap.phases.length > 0 && (
        <div>
          <h2
            className="text-sm font-semibold uppercase tracking-wider mb-5"
            style={{ color: "var(--text-muted)" }}
          >
            Learning Phases
          </h2>

          <div className="relative">
            {/* Vertical connecting line */}
            <div
              className="absolute left-[19px] top-6 bottom-6 w-px"
              style={{ backgroundColor: "var(--border-subtle)" }}
              aria-hidden="true"
            />

            <div className="space-y-6">
              {roadmap.phases.map((phase) => (
                <div key={phase.phase} className="relative flex gap-5">
                  {/* Phase number circle */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-display text-sm z-10"
                    style={{
                      backgroundColor: "var(--cyan)",
                      color: "var(--text-inverse)",
                    }}
                  >
                    {phase.phase}
                  </div>

                  {/* Phase content */}
                  <div className="card p-5 flex-1">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3
                        className="text-base font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {phase.title}
                      </h3>
                      <span
                        className="inline-flex items-center gap-1 text-xs font-mono shrink-0 px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: "var(--cyan-08)",
                          color: "var(--cyan)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <CalendarIcon className="w-3 h-3" />
                        {phase.duration_weeks}w
                      </span>
                    </div>

                    <p
                      className="text-sm mb-4"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {phase.focus}
                    </p>

                    {/* Tasks */}
                    <div className="space-y-2 mb-4">
                      {phase.tasks.map((task, ti) => (
                        <div key={ti} className="flex items-start gap-2.5">
                          <div
                            className="w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5"
                            style={{
                              borderColor: "var(--border-default)",
                              backgroundColor: "var(--bg-elevated)",
                            }}
                          >
                            <div
                              className="w-1.5 h-1.5 rounded-sm"
                              style={{ backgroundColor: "var(--border-default)" }}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p
                              className="text-sm"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {task.task}
                            </p>
                            {task.resource && (
                              <p className="text-xs mt-0.5 flex items-center gap-2">
                                <span style={{ color: "var(--cyan)" }}>
                                  {task.resource}
                                </span>
                                <span
                                  className="font-mono tabular-nums"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  {task.hours}h
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Milestone */}
                    <div
                      className="flex items-center gap-2 pt-3"
                      style={{ borderTop: "1px solid var(--border-subtle)" }}
                    >
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: "var(--green-15)",
                          color: "var(--green)",
                        }}
                      >
                        <CheckIcon className="w-3 h-3" />
                      </div>
                      <span
                        className="text-xs font-medium"
                        style={{ color: "var(--green)" }}
                      >
                        Milestone: {phase.milestone}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Role Progression Path */}
      {roadmap.recommended_roles_progression &&
        roadmap.recommended_roles_progression.length > 0 && (
          <div className="card p-6">
            <h2
              className="text-sm font-semibold uppercase tracking-wider mb-5"
              style={{ color: "var(--text-muted)" }}
            >
              Recommended Role Progression
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              {roadmap.recommended_roles_progression.map((role, i) => {
                const isLast =
                  i === roadmap.recommended_roles_progression!.length - 1;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: isLast
                          ? "var(--cyan-15)"
                          : "var(--bg-elevated)",
                        color: isLast ? "var(--cyan)" : "var(--text-secondary)",
                        border: `1px solid ${
                          isLast ? "var(--cyan-40)" : "var(--border-subtle)"
                        }`,
                      }}
                    >
                      {role}
                    </span>
                    {!isLast && (
                      <ArrowRightIcon
                        className="w-4 h-4 shrink-0"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      {/* Salary Trajectory */}
      {roadmap.salary_trajectory && (
        <SalaryTrajectoryCard salary={roadmap.salary_trajectory} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Salary Trajectory Card
// ---------------------------------------------------------------------------

function SalaryTrajectoryCard({
  salary,
}: {
  salary: NonNullable<Roadmap["salary_trajectory"]>;
}) {
  const hasCurrent = salary.current_estimated != null && salary.current_estimated > 0;
  const hasAfter = salary.after_roadmap != null && salary.after_roadmap > 0;
  const hasRange =
    salary.target_role_range &&
    salary.target_role_range.length >= 2;

  if (!hasCurrent && !hasAfter && !hasRange) return null;

  return (
    <div className="card p-6">
      <h2
        className="text-sm font-semibold uppercase tracking-wider mb-5"
        style={{ color: "var(--text-muted)" }}
      >
        Salary Trajectory
      </h2>

      <div className="flex items-center justify-around flex-wrap gap-4">
        {/* Current */}
        {hasCurrent && (
          <div className="text-center">
            <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
              Current (est.)
            </p>
            <p
              className="text-2xl font-display tabular-nums"
              style={{ color: "var(--text-secondary)" }}
            >
              {formatCurrency(salary.current_estimated!)}
            </p>
          </div>
        )}

        {/* Arrow */}
        {hasCurrent && hasAfter && (
          <ArrowRightIcon className="w-5 h-5 shrink-0" />
        )}

        {/* After Roadmap */}
        {hasAfter && (
          <div className="text-center">
            <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
              After Roadmap
            </p>
            <p
              className="text-2xl font-display tabular-nums"
              style={{ color: "var(--green)" }}
            >
              {formatCurrency(salary.after_roadmap!)}
            </p>
          </div>
        )}

        {/* Arrow */}
        {hasAfter && hasRange && (
          <ArrowRightIcon className="w-5 h-5 shrink-0" />
        )}

        {/* Target Range */}
        {hasRange && (
          <div className="text-center">
            <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
              Target Role Range
            </p>
            <p
              className="text-2xl font-display tabular-nums"
              style={{ color: "var(--cyan)" }}
            >
              {formatCurrency(salary.target_role_range![0])} &ndash;{" "}
              {formatCurrency(salary.target_role_range![1])}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
