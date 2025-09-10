"use client";
import { GhostScore } from "@/components/ui/ghost-score";
import { CompanyTrajBadge } from "@/components/ui/company-badge";
import { SalaryRange } from "@/components/ui/salary-range";

interface JobCardProps {
  job: {
    job_id: string;
    title: string;
    company: string;
    company_logo?: string;
    location?: string;
    country?: string;
    is_remote?: boolean;
    salary_min?: number | null;
    salary_max?: number | null;
    ghost_score?: number | null;
    posted_at?: string;
    required_skills?: string;
    source?: string;
    apply_link?: string;
    description?: string;
    external_applicant_count?: number | null;
    internal_applicant_count?: number | null;
  };
  companyTrajectory?: "scaling" | "stable" | "contracting" | "risk";
  marketSalaryMin?: number;
  marketSalaryMax?: number;
  aiInsight?: string;
  mode?: "compact" | "full";
  onApply?: () => void;
  onSave?: () => void;
  onAnalyze?: () => void;
  onClick?: () => void;
  selected?: boolean;
}

const countryFlags: Record<string, string> = {
  US: "\uD83C\uDDFA\uD83C\uDDF8",
  GB: "\uD83C\uDDEC\uD83C\uDDE7",
  UK: "\uD83C\uDDEC\uD83C\uDDE7",
  DE: "\uD83C\uDDE9\uD83C\uDDEA",
  FR: "\uD83C\uDDEB\uD83C\uDDF7",
  CA: "\uD83C\uDDE8\uD83C\uDDE6",
  AU: "\uD83C\uDDE6\uD83C\uDDFA",
  IL: "\uD83C\uDDEE\uD83C\uDDF1",
  IN: "\uD83C\uDDEE\uD83C\uDDF3",
  NL: "\uD83C\uDDF3\uD83C\uDDF1",
  IE: "\uD83C\uDDEE\uD83C\uDDEA",
  SG: "\uD83C\uDDF8\uD83C\uDDEC",
  JP: "\uD83C\uDDEF\uD83C\uDDF5",
  SE: "\uD83C\uDDF8\uD83C\uDDEA",
  CH: "\uD83C\uDDE8\uD83C\uDDED",
  ES: "\uD83C\uDDEA\uD83C\uDDF8",
  BR: "\uD83C\uDDE7\uD83C\uDDF7",
  Remote: "\uD83C\uDF0D",
};

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffDay = Math.floor(diffMs / 86400000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "1 day ago";
  if (diffDay < 7) return `${diffDay} days ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return `${Math.floor(diffDay / 30)}mo ago`;
}

function getGhostBarClass(score: number | null | undefined): string {
  if (score == null) return "";
  if (score < 25) return "ghost-bar-real";
  if (score < 50) return "ghost-bar-verify";
  if (score < 75) return "ghost-bar-suspicious";
  return "ghost-bar-ghost";
}

function getLettermarkColor(company: string): string {
  const colors = [
    "var(--cyan)",
    "var(--green)",
    "var(--gold)",
    "var(--purple)",
    "#ff8800",
    "var(--red)",
  ];
  let hash = 0;
  for (let i = 0; i < company.length; i++) {
    hash = company.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function parseSkills(skills?: string): string[] {
  if (!skills) return [];
  return skills
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function JobCard({
  job,
  companyTrajectory,
  marketSalaryMin,
  marketSalaryMax,
  aiInsight,
  mode = "full",
  onApply,
  onSave,
  onAnalyze,
  onClick,
  selected = false,
}: JobCardProps) {
  const skills = parseSkills(job.required_skills);
  const postedDaysAgo = job.posted_at
    ? Math.floor((Date.now() - new Date(job.posted_at).getTime()) / 86400000)
    : null;
  const isFresh = postedDaysAgo !== null && postedDaysAgo < 7;
  const letterColor = getLettermarkColor(job.company);
  const flag = job.country ? countryFlags[job.country.toUpperCase()] : null;

  return (
    <article
      className={[
        "relative rounded-lg overflow-hidden transition-all duration-200 cursor-pointer group",
        getGhostBarClass(job.ghost_score),
        selected ? "ring-1" : "",
      ].join(" ")}
      style={{
        backgroundColor: "var(--bg-surface)",
        boxShadow: selected
          ? "var(--shadow-card), 0 0 0 1px var(--cyan-40), var(--shadow-glow-cyan)"
          : "var(--shadow-card)",
        borderColor: selected ? "var(--cyan-40)" : "var(--border-subtle)",
        borderWidth: selected ? 0 : "1px",
        borderStyle: "solid",
        borderLeftWidth: job.ghost_score != null ? "3px" : undefined,
      }}
      onClick={onClick}
      tabIndex={0}
      role="button"
      aria-label={`${job.title} at ${job.company}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="p-4">
        {/* Top row: Company info + ghost score */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Company lettermark or logo */}
            {job.company_logo ? (
              <img
                src={job.company_logo}
                alt={`${job.company} logo`}
                className="w-10 h-10 rounded-lg object-contain shrink-0"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                }}
              />
            ) : (
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center font-display text-sm shrink-0"
                style={{
                  backgroundColor: `color-mix(in srgb, ${letterColor} 15%, transparent)`,
                  color: letterColor,
                  border: `1px solid color-mix(in srgb, ${letterColor} 25%, transparent)`,
                }}
              >
                {job.company.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {job.company}
                </span>
                {companyTrajectory && (
                  <CompanyTrajBadge trajectory={companyTrajectory} size="sm" />
                )}
              </div>
              <h3
                className="font-semibold leading-snug mt-0.5 line-clamp-2"
                style={{
                  color: "var(--text-primary)",
                  fontSize: "16px",
                }}
              >
                {job.title}
              </h3>
            </div>
          </div>

          {/* Ghost score */}
          {job.ghost_score != null && (
            <div className="shrink-0">
              <GhostScore score={job.ghost_score} size="sm" showLabel={mode === "full"} />
            </div>
          )}
        </div>

        {/* Location row */}
        <div className="flex items-center gap-3 mt-2.5 flex-wrap">
          {(job.location || job.country) && (
            <span
              className="inline-flex items-center gap-1 text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M8 1C5.24 1 3 3.24 3 6c0 4.5 5 9 5 9s5-4.5 5-9c0-2.76-2.24-5-5-5z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
                <circle cx="8" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.3" />
              </svg>
              {flag && <span className="text-sm">{flag}</span>}
              {job.location || job.country}
            </span>
          )}
          {job.is_remote && (
            <span
              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: "var(--green-08)",
                color: "var(--green)",
              }}
            >
              <span className="text-sm">{countryFlags["Remote"]}</span>
              Remote
            </span>
          )}

          {/* Applicant counts */}
          {job.external_applicant_count != null && job.external_applicant_count > 0 && (
            <span
              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
              style={{
                backgroundColor:
                  job.external_applicant_count > 100
                    ? "var(--red-08, rgba(255,59,48,0.08))"
                    : job.external_applicant_count > 50
                      ? "var(--gold-08, rgba(255,204,0,0.08))"
                      : "var(--cyan-08)",
                color:
                  job.external_applicant_count > 100
                    ? "var(--red)"
                    : job.external_applicant_count > 50
                      ? "var(--gold)"
                      : "var(--cyan)",
              }}
              title={`${job.external_applicant_count} applicants on ${job.source || "source"}`}
            >
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 1a3 3 0 100 6 3 3 0 000-6zM3 13c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              {job.external_applicant_count} applicants
            </span>
          )}
          {job.internal_applicant_count != null && job.internal_applicant_count > 0 && (
            <span
              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: "var(--purple-08, rgba(175,82,222,0.08))",
                color: "var(--purple, #af52de)",
              }}
              title={`${job.internal_applicant_count} JobIntel users tracking this position`}
            >
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M5.5 1.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM10.5 3a2 2 0 100 4 2 2 0 000-4zM1 13c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5M10 11.5c0-1.4.9-2.5 2.5-2.5s2.5 1.1 2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              {job.internal_applicant_count} tracking
            </span>
          )}

          {/* Posted date + freshness */}
          {job.posted_at && (
            <span
              className="inline-flex items-center gap-1.5 text-xs ml-auto"
              style={{ color: "var(--text-muted)" }}
            >
              {isFresh && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: "var(--green)" }}
                  aria-label="Recently posted"
                />
              )}
              {relativeTime(job.posted_at)}
            </span>
          )}
        </div>

        {/* Salary row */}
        <div className="mt-2.5">
          <SalaryRange
            min={job.salary_min}
            max={job.salary_max}
            marketMin={marketSalaryMin}
            marketMax={marketSalaryMax}
            showMarketComparison={!!(marketSalaryMin || marketSalaryMax)}
          />
        </div>

        {/* Skills pills */}
        {skills.length > 0 && mode === "full" && (
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            {skills.map((skill) => (
              <span
                key={skill}
                className="px-2 py-0.5 rounded text-xs font-medium"
                style={{
                  backgroundColor: "var(--cyan-08)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {skill}
              </span>
            ))}
          </div>
        )}

        {/* AI Insight */}
        {aiInsight && mode === "full" && (
          <p
            className="text-xs italic mt-3 leading-relaxed line-clamp-1"
            style={{ color: "var(--text-muted)" }}
          >
            {aiInsight}
          </p>
        )}

        {/* Actions row */}
        {mode === "full" && (
          <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            {/* Apply button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onApply?.();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 btn-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]"
              style={{
                backgroundColor: "var(--green)",
                color: "var(--text-inverse)",
              }}
              aria-label="Apply to this job"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M14 2l-7 7M14 2l-4 12-3-5-5-3 12-4z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Apply
            </button>

            {/* Save icon button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSave?.();
              }}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 btn-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]"
              style={{
                backgroundColor: "var(--bg-elevated)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-subtle)",
              }}
              aria-label="Save this job"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 2h10a1 1 0 011 1v11.5l-5-3-5 3V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </button>

            {/* Analyze icon button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAnalyze?.();
              }}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 btn-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]"
              style={{
                backgroundColor: "var(--bg-elevated)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-subtle)",
              }}
              aria-label="Analyze this job"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 12l4-5 3 3 5-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Source badge */}
            {job.source && (
              <span
                className="text-[10px] ml-auto px-1.5 py-0.5 rounded font-mono"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  color: "var(--text-muted)",
                }}
              >
                {job.source}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Hover glow overlay */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-lg"
        style={{
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      />
    </article>
  );
}

export default JobCard;
