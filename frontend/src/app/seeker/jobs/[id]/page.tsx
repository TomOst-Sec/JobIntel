"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { GhostScore } from "@/components/ui/ghost-score";
import { SalaryRange } from "@/components/ui/salary-range";
import { Button } from "@/components/ui/button";
import { ApplyModal } from "@/components/job/apply-modal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Job {
  job_id: string;
  title: string;
  company: string;
  company_logo?: string;
  location?: string;
  country?: string;
  is_remote?: boolean;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_period?: string;
  ghost_score?: number | null;
  posted_at?: string;
  required_skills?: string;
  source?: string;
  apply_link?: string;
  description?: string;
  employment_type?: string;
  experience_required?: string;
  category?: string;
}

interface JobsResponse {
  items: Job[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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
    .filter(Boolean);
}

function getGhostExplanation(score: number): string {
  if (score < 25)
    return "This posting shows strong indicators of being a legitimate, actively-recruited position. Application engagement and recruiter responsiveness are above average.";
  if (score < 50)
    return "This posting is likely real but shows some minor warning signals. Verify the listing is current before applying.";
  if (score < 75)
    return "This posting shows multiple warning signals. The listing may be stale, auto-reposted, or used for resume harvesting. Proceed with caution.";
  return "High risk of being a ghost job. Multiple indicators suggest this position is not actively being filled. Consider verifying directly with the company before investing time.";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const jobId = params.id;

  // Data state
  const [job, setJob] = useState<Job | null>(null);
  const [similarJobs, setSimilarJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // UI state
  const [applyOpen, setApplyOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Fetch job data
  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setNotFound(false);

    try {
      const data = await api.get<JobsResponse>(
        `/jobs?query=${encodeURIComponent(jobId)}&per_page=1`
      );
      const items = data.items || [];
      const match = items.find((j) => j.job_id === jobId) || items[0] || null;

      if (!match) {
        setNotFound(true);
        setJob(null);
      } else {
        setJob(match);
        // Fetch similar jobs from same company
        try {
          const similar = await api.get<JobsResponse>(
            `/jobs?query=${encodeURIComponent(match.company)}&per_page=4`
          );
          setSimilarJobs(
            (similar.items || []).filter((j) => j.job_id !== jobId).slice(0, 3)
          );
        } catch {
          // Similar jobs are non-critical
        }
      }
    } catch {
      setNotFound(true);
      setJob(null);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  // Auth loading guard
  if (authLoading || !user) return null;

  // Loading skeleton
  if (loading) {
    return (
      <div
        className="flex flex-col min-h-screen"
        style={{ backgroundColor: "var(--bg-deep)" }}
      >
        <TopNav />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex gap-8">
            <div className="flex-1 space-y-6">
              <div className="shimmer rounded-lg" style={{ height: "32px", width: "300px" }} />
              <div className="card shimmer rounded-lg" style={{ height: "120px" }} />
              <div className="card shimmer rounded-lg" style={{ height: "48px" }} />
              <div className="card shimmer rounded-lg" style={{ height: "400px" }} />
            </div>
            <div className="hidden lg:block space-y-6" style={{ width: "340px" }}>
              <div className="card shimmer rounded-lg" style={{ height: "160px" }} />
              <div className="card shimmer rounded-lg" style={{ height: "120px" }} />
              <div className="card shimmer rounded-lg" style={{ height: "100px" }} />
            </div>
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  // 404 state
  if (notFound || !job) {
    return (
      <div
        className="flex flex-col min-h-screen"
        style={{ backgroundColor: "var(--bg-deep)" }}
      >
        <TopNav />
        <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <svg
            className="w-20 h-20 mb-6"
            viewBox="0 0 80 80"
            fill="none"
            aria-hidden="true"
            style={{ color: "var(--text-muted)" }}
          >
            <circle cx="40" cy="40" r="30" stroke="currentColor" strokeWidth="2" />
            <path
              d="M30 32h.01M50 32h.01"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M30 50c3-4 7-6 10-6s7 2 10 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <h1
            className="text-2xl font-display mb-3"
            style={{ color: "var(--text-primary)" }}
          >
            Job Not Found
          </h1>
          <p
            className="text-sm mb-8 max-w-md"
            style={{ color: "var(--text-secondary)" }}
          >
            This job listing may have been removed, expired, or the link is
            incorrect. Try searching for similar positions.
          </p>
          <div className="flex gap-3">
            <Button variant="primary" onClick={() => router.push("/seeker")}>
              Browse Jobs
            </Button>
            <Button variant="secondary" onClick={() => router.back()}>
              Go Back
            </Button>
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  const skills = parseSkills(job.required_skills);
  const letterColor = getLettermarkColor(job.company);

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: "var(--bg-deep)" }}
    >
      <TopNav />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6">
        {/* Breadcrumb */}
        <nav
          className="flex items-center gap-2 text-xs mb-6"
          aria-label="Breadcrumb"
        >
          <Link
            href="/seeker"
            className="transition-colors duration-150"
            style={{ color: "var(--text-muted)" }}
          >
            Jobs
          </Link>
          <span style={{ color: "var(--text-muted)" }} aria-hidden="true">
            /
          </span>
          <span
            className="transition-colors duration-150"
            style={{ color: "var(--text-muted)" }}
          >
            {job.company}
          </span>
          <span style={{ color: "var(--text-muted)" }} aria-hidden="true">
            /
          </span>
          <span
            className="truncate max-w-[200px]"
            style={{ color: "var(--text-secondary)" }}
          >
            {job.title}
          </span>
        </nav>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* ============================================================
              MAIN CONTENT (Left 2/3)
              ============================================================ */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Job Header Card */}
            <div className="card p-6">
              <div className="flex items-start gap-4">
                {/* Company logo / lettermark */}
                {job.company_logo ? (
                  <img
                    src={job.company_logo}
                    alt={`${job.company} logo`}
                    className="w-14 h-14 rounded-xl object-contain shrink-0"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  />
                ) : (
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center font-display text-xl shrink-0"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${letterColor} 15%, transparent)`,
                      color: letterColor,
                      border: `1px solid color-mix(in srgb, ${letterColor} 25%, transparent)`,
                    }}
                  >
                    {job.company.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {job.company}
                  </p>
                  <h1
                    className="text-xl sm:text-2xl font-display leading-tight mt-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {job.title}
                  </h1>

                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    {/* Location */}
                    {job.location && (
                      <span
                        className="inline-flex items-center gap-1 text-sm"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M8 1C5.24 1 3 3.24 3 6c0 4.5 5 9 5 9s5-4.5 5-9c0-2.76-2.24-5-5-5z"
                            stroke="currentColor"
                            strokeWidth="1.3"
                          />
                          <circle
                            cx="8"
                            cy="6"
                            r="1.5"
                            stroke="currentColor"
                            strokeWidth="1.3"
                          />
                        </svg>
                        {job.location}
                      </span>
                    )}

                    {/* Remote badge */}
                    {job.is_remote && (
                      <span
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium"
                        style={{
                          backgroundColor: "var(--green-08)",
                          color: "var(--green)",
                        }}
                      >
                        Remote
                      </span>
                    )}

                    {/* Posted time */}
                    {job.posted_at && (
                      <span
                        className="text-sm"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Posted {relativeTime(job.posted_at)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="card p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => setApplyOpen(true)}
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M14 2l-7 7M14 2l-4 12-3-5-5-3 12-4z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Apply Now
                </Button>

                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setSaved(!saved)}
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 2h10a1 1 0 011 1v11.5l-5-3-5 3V3a1 1 0 011-1z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      fill={saved ? "currentColor" : "none"}
                    />
                  </svg>
                  {saved ? "Saved" : "Save"}
                </Button>

                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({
                        title: `${job.title} at ${job.company}`,
                        url: window.location.href,
                      });
                    } else {
                      navigator.clipboard.writeText(window.location.href);
                    }
                  }}
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
                    <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.3" />
                    <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.3" />
                    <path
                      d="M6 7l4-2M6 9l4 2"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                  </svg>
                  Share
                </Button>

                <Button variant="ghost" size="md">
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 13V8a5 5 0 0110 0v5"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                    <circle cx="8" cy="5" r="1" fill="currentColor" />
                  </svg>
                  Report
                </Button>
              </div>
            </div>

            {/* Mobile Intelligence Cards (visible below lg) */}
            <div className="lg:hidden space-y-4">
              <IntelligenceSidebar
                job={job}
                similarJobs={similarJobs}
                inline
              />
            </div>

            {/* Description Section */}
            <div className="card p-6">
              <h2
                className="text-sm font-semibold uppercase tracking-wider mb-4"
                style={{ color: "var(--text-muted)" }}
              >
                Job Description
              </h2>
              {job.description ? (
                <div
                  className="text-sm leading-relaxed prose-invert"
                  style={{ color: "var(--text-secondary)" }}
                  dangerouslySetInnerHTML={{ __html: job.description }}
                />
              ) : (
                <p
                  className="text-sm italic"
                  style={{ color: "var(--text-muted)" }}
                >
                  No detailed description is available for this position. Check
                  the original listing for more information.
                </p>
              )}
            </div>

            {/* Requirements Section */}
            {skills.length > 0 && (
              <div className="card p-6">
                <h2
                  className="text-sm font-semibold uppercase tracking-wider mb-4"
                  style={{ color: "var(--text-muted)" }}
                >
                  Required Skills
                </h2>
                <ul className="space-y-2">
                  {skills.map((skill) => (
                    <li key={skill} className="flex items-center gap-3">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: "var(--cyan)" }}
                        aria-hidden="true"
                      />
                      <span
                        className="text-sm"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {skill}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Employment Details */}
            <div className="card p-6">
              <h2
                className="text-sm font-semibold uppercase tracking-wider mb-4"
                style={{ color: "var(--text-muted)" }}
              >
                Employment Details
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailItem
                  label="Employment Type"
                  value={job.employment_type || "Not specified"}
                />
                <DetailItem
                  label="Experience"
                  value={job.experience_required || "Not specified"}
                />
                <DetailItem
                  label="Salary Period"
                  value={job.salary_period || "Annual"}
                />
              </div>
            </div>
          </div>

          {/* ============================================================
              INTELLIGENCE SIDEBAR (Right 1/3, desktop only)
              ============================================================ */}
          <aside className="hidden lg:block shrink-0" style={{ width: "340px" }}>
            <div className="sticky top-24 space-y-5">
              <IntelligenceSidebar
                job={job}
                similarJobs={similarJobs}
                inline={false}
              />
            </div>
          </aside>
        </div>
      </main>

      <MobileNav />

      {/* Apply Modal */}
      <ApplyModal job={job} open={applyOpen} onClose={() => setApplyOpen(false)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Item
// ---------------------------------------------------------------------------

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="text-xs font-medium mb-1"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>
      <p
        className="text-sm font-medium"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intelligence Sidebar
// ---------------------------------------------------------------------------

function IntelligenceSidebar({
  job,
  similarJobs,
  inline,
}: {
  job: Job;
  similarJobs: Job[];
  inline: boolean;
}) {
  const letterColor = getLettermarkColor(job.company);

  return (
    <>
      {/* Ghost Score Card */}
      {job.ghost_score != null && (
        <div className="card p-5">
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            Ghost Score Analysis
          </h3>
          <div className="flex items-center justify-center mb-4">
            <GhostScore score={job.ghost_score} size="lg" showLabel />
          </div>
          <p
            className="text-xs leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            {getGhostExplanation(job.ghost_score)}
          </p>
        </div>
      )}

      {/* Salary Intelligence Card */}
      <div className="card p-5">
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-4"
          style={{ color: "var(--text-muted)" }}
        >
          Salary Intelligence
        </h3>
        <div className="mb-3">
          <SalaryRange
            min={job.salary_min}
            max={job.salary_max}
            showMarketComparison={false}
          />
        </div>
        <p
          className="text-xs leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          {job.salary_min || job.salary_max
            ? "Salary data disclosed by the employer. Compare with market rates for this role and location to evaluate competitiveness."
            : "Salary not disclosed by the employer. Market data suggests checking similar roles in this region for expected compensation."}
        </p>
      </div>

      {/* Company Intelligence Card */}
      <div className="card p-5">
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-4"
          style={{ color: "var(--text-muted)" }}
        >
          Company Intelligence
        </h3>
        <div className="flex items-center gap-3 mb-3">
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
            <p
              className="text-sm font-semibold truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {job.company}
            </p>
            {job.location && (
              <p
                className="text-xs truncate"
                style={{ color: "var(--text-muted)" }}
              >
                {job.location}
              </p>
            )}
          </div>
        </div>
        <Link
          href={`/seeker/companies?q=${encodeURIComponent(job.company)}`}
          className="inline-flex items-center gap-1 text-xs font-medium transition-colors duration-200"
          style={{ color: "var(--cyan)" }}
        >
          View company profile
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4.5 2.5L8 6l-3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>

      {/* Quick Stats Card */}
      <div className="card p-5">
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-4"
          style={{ color: "var(--text-muted)" }}
        >
          Quick Stats
        </h3>
        <div className="space-y-3">
          <QuickStatRow
            label="Posted"
            value={job.posted_at ? formatDate(job.posted_at) : "Unknown"}
          />
          <QuickStatRow
            label="Source"
            value={job.source || "Direct"}
          />
          <QuickStatRow
            label="Type"
            value={job.employment_type || "Not specified"}
          />
          {job.category && (
            <QuickStatRow label="Category" value={job.category} />
          )}
        </div>
      </div>

      {/* Similar Jobs */}
      {similarJobs.length > 0 && (
        <div className="card p-5">
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            Similar Jobs
          </h3>
          <div className="space-y-3">
            {similarJobs.map((sj) => (
              <Link
                key={sj.job_id}
                href={`/seeker/jobs/${sj.job_id}`}
                className="block rounded-lg p-3 transition-all duration-200"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <p
                  className="text-sm font-medium leading-snug line-clamp-1"
                  style={{ color: "var(--text-primary)" }}
                >
                  {sj.title}
                </p>
                <p
                  className="text-xs mt-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {sj.company}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  {sj.location && (
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {sj.location}
                    </span>
                  )}
                  {sj.ghost_score != null && (
                    <GhostScore score={sj.ghost_score} size="sm" showLabel={false} />
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Back to Search */}
      <Link
        href="/seeker"
        className="flex items-center gap-2 text-sm font-medium transition-colors duration-200 px-1"
        style={{ color: "var(--cyan)" }}
      >
        <svg
          className="w-4 h-4"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M10 12L6 8l4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back to Search
      </Link>
    </>
  );
}

// ---------------------------------------------------------------------------
// Quick Stat Row
// ---------------------------------------------------------------------------

function QuickStatRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between py-2"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span
        className="text-xs font-medium"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

