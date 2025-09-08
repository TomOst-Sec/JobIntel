"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";

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

interface OutreachStats {
  total: number;
  drafts: number;
  sent: number;
  opened: number;
  replied: number;
  open_rate: number;
  reply_rate: number;
}

interface BriefingSection {
  title: string;
  content: string;
}

interface Briefing {
  date: string;
  sections: BriefingSection[];
  pipeline_summary: PipelineStats;
  action_items: string[];
}

interface SearchListItem {
  search_id: string;
  brief: string;
  status: string;
  created_at: string;
}

function LiveCounter({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div
      className="rounded-xl p-4 flex-1 min-w-[140px]"
      style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
    >
      <p className="text-2xl font-bold" style={{ color, fontFeatureSettings: "'tnum'" }}>
        {value}
      </p>
      <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{label}</p>
    </div>
  );
}

export default function RecruiterDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [pipelineStats, setPipelineStats] = useState<PipelineStats | null>(null);
  const [outreachStats, setOutreachStats] = useState<OutreachStats | null>(null);
  const [searches, setSearches] = useState<SearchListItem[]>([]);
  const [loadingBriefing, setLoadingBriefing] = useState(true);

  useEffect(() => {
    if (!authLoading && (!user || (user.role !== "recruiter" && user.role !== "admin"))) {
      router.push("/seeker");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    Promise.all([
      api.get<Briefing>("/recruiter/briefing").catch(() => null),
      api.get<PipelineStats>("/recruiter/pipeline/stats").catch(() => null),
      api.get<OutreachStats>("/recruiter/outreach/stats").catch(() => null),
      api.get<SearchListItem[]>("/recruiter/searches").catch(() => []),
    ]).then(([b, p, o, s]) => {
      if (b) setBriefing(b);
      if (p) setPipelineStats(p);
      if (o) setOutreachStats(o);
      setSearches((s as SearchListItem[]) || []);
      setLoadingBriefing(false);
    });
  }, []);

  if (authLoading) return null;

  const avgMatchScore = 0; // Would need to compute from search results

  return (
    <div style={{ backgroundColor: "var(--bg-deep)", minHeight: "100vh" }}>
      <TopNav showSearch={false} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="text-xl font-semibold mb-6" style={{ color: "var(--text-primary)" }}>
          Command Center
        </h1>

        {/* Top counters */}
        <div className="flex flex-wrap gap-4 mb-8">
          <LiveCounter value={searches.length} label="Active Searches" color="var(--cyan)" />
          <LiveCounter value={pipelineStats?.total ?? 0} label="Pipeline Total" color="var(--green)" />
          <LiveCounter value={outreachStats?.reply_rate ?? 0} label="Response Rate %" color="var(--gold)" />
          <LiveCounter value={outreachStats?.sent ?? 0} label="Messages Sent" color="var(--purple)" />
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Column (60%) */}
          <div className="lg:w-3/5 space-y-6">
            {/* AI Daily Briefing */}
            <div
              className="rounded-xl p-6"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" style={{ color: "var(--cyan)" }}>
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  AI Daily Briefing
                </h2>
                {briefing && (
                  <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>
                    {briefing.date}
                  </span>
                )}
              </div>

              {loadingBriefing ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-4 rounded animate-pulse" style={{ backgroundColor: "var(--bg-elevated)" }} />
                  ))}
                </div>
              ) : briefing ? (
                <div className="space-y-4">
                  {briefing.sections.map((section, i) => (
                    <div key={i}>
                      <h3 className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--cyan)" }}>
                        {section.title}
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        {section.content}
                      </p>
                    </div>
                  ))}

                  {briefing.action_items.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--gold)" }}>
                        Action Items
                      </h3>
                      <ul className="space-y-1">
                        {briefing.action_items.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                            <span className="w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5" style={{ borderColor: "var(--border-default)" }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--text-muted)" }} />
                            </span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  No briefing available yet. Start adding candidates to your pipeline.
                </p>
              )}
            </div>

            {/* Recent Searches */}
            <div
              className="rounded-xl p-6"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            >
              <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                Recent Searches
              </h2>
              {searches.length > 0 ? (
                <div className="space-y-2">
                  {searches.slice(0, 5).map((s) => (
                    <Link
                      key={s.search_id}
                      href="/recruiter/search"
                      className="block px-3 py-2.5 rounded-lg transition-colors"
                      style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
                    >
                      <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
                        {s.brief}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {new Date(s.created_at).toLocaleDateString()} · {s.status}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  No searches yet.{" "}
                  <Link href="/recruiter/search" style={{ color: "var(--cyan)" }}>Start one</Link>
                </p>
              )}
            </div>
          </div>

          {/* Right Column (40%) */}
          <div className="lg:w-2/5 space-y-6">
            {/* Pipeline mini-summary */}
            {pipelineStats && (
              <div
                className="rounded-xl p-6"
                style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
              >
                <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  Pipeline
                </h2>
                <div className="space-y-2">
                  {[
                    { label: "Sourced", value: pipelineStats.sourced, color: "var(--text-muted)" },
                    { label: "Contacted", value: pipelineStats.contacted, color: "var(--cyan)" },
                    { label: "Responded", value: pipelineStats.responded, color: "var(--gold)" },
                    { label: "Interview", value: pipelineStats.interview, color: "var(--purple)" },
                    { label: "Offer", value: pipelineStats.offer, color: "var(--green)" },
                    { label: "Hired", value: pipelineStats.hired, color: "var(--green)" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="text-xs w-20" style={{ color: "var(--text-muted)" }}>{label}</span>
                      <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: "var(--bg-elevated)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: pipelineStats.total > 0 ? `${(value / pipelineStats.total) * 100}%` : "0%",
                            backgroundColor: color,
                            minWidth: value > 0 ? "4px" : "0",
                          }}
                        />
                      </div>
                      <span className="text-xs w-6 text-right" style={{ color: "var(--text-muted)", fontFeatureSettings: "'tnum'" }}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
                <Link
                  href="/recruiter/pipeline"
                  className="inline-block mt-3 text-xs font-medium"
                  style={{ color: "var(--cyan)" }}
                >
                  View Pipeline →
                </Link>
              </div>
            )}

            {/* Outreach stats */}
            {outreachStats && (
              <div
                className="rounded-xl p-6"
                style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
              >
                <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  Outreach
                </h2>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-lg font-bold" style={{ color: "var(--cyan)", fontFeatureSettings: "'tnum'" }}>
                      {outreachStats.sent}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Sent</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold" style={{ color: "var(--gold)", fontFeatureSettings: "'tnum'" }}>
                      {outreachStats.open_rate}%
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Opened</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold" style={{ color: "var(--green)", fontFeatureSettings: "'tnum'" }}>
                      {outreachStats.reply_rate}%
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Replied</p>
                  </div>
                </div>
                <Link
                  href="/recruiter/outreach"
                  className="inline-block mt-3 text-xs font-medium"
                  style={{ color: "var(--cyan)" }}
                >
                  View Outreach →
                </Link>
              </div>
            )}

            {/* Quick actions */}
            <div
              className="rounded-xl p-6"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            >
              <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                Quick Actions
              </h2>
              <div className="space-y-2">
                <Link
                  href="/recruiter/search"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
                  style={{ backgroundColor: "var(--cyan-08)", border: "1px solid var(--cyan-15)" }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" style={{ color: "var(--cyan)" }}>
                    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span className="text-sm" style={{ color: "var(--cyan)" }}>New Candidate Search</span>
                </Link>
                <Link
                  href="/recruiter/pipeline"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
                  style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" style={{ color: "var(--text-secondary)" }}>
                    <rect x="1" y="1" width="4" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="6" y="4" width="4" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="11" y="7" width="4" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>View Pipeline</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <MobileNav />
    </div>
  );
}
