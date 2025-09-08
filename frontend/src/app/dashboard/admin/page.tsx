"use client";
import { useEffect, useState, useCallback } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";

interface ScraperStatus {
  scraper_name: string;
  is_enabled: boolean;
  interval_hours: number;
  schedule_group: string;
  last_run_at: string | null;
  last_status: string | null;
  last_jobs_found: number;
}

interface LifecycleStats {
  active: number;
  stale: number;
  expired: number;
  ghost: number;
  archived: number;
  total: number;
}

const LIFECYCLE_CONFIG: Record<string, { color: string }> = {
  active: { color: "var(--green)" },
  stale: { color: "var(--gold)" },
  expired: { color: "var(--red)" },
  ghost: { color: "var(--purple)" },
  archived: { color: "var(--text-muted)" },
};

const GROUP_LABELS: Record<string, string> = {
  fast_scrapers: "Fast (2h)",
  standard_scrapers: "Standard (4h)",
  board_scrapers: "Board (6h)",
  hn_scraper: "HN (Daily)",
  jsearch_daily: "JSearch (Daily)",
  lifecycle_maintenance: "Lifecycle (4h)",
};

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [scrapers, setScrapers] = useState<ScraperStatus[]>([]);
  const [lifecycle, setLifecycle] = useState<LifecycleStats | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchData = useCallback(() => {
    if (!token) return;
    fetch("/api/v1/admin/scrapers/status", { headers })
      .then((r) => r.json())
      .then(setScrapers)
      .catch(() => {});
    fetch("/api/v1/admin/jobs/lifecycle-stats", { headers })
      .then((r) => r.json())
      .then(setLifecycle)
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  const isAdmin = user?.role === "admin" || user?.role === "recruiter";

  useEffect(() => {
    if (isAdmin) {
      fetchData();
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }
  }, [fetchData, isAdmin]);

  const triggerGroup = async (group: string) => {
    setTriggering(group);
    try {
      await fetch(`/api/v1/admin/scrapers/run/${group}`, {
        method: "POST",
        headers,
      });
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      setTriggering(null);
      fetchData();
    }, 2000);
  };

  if (loading || !user) return null;

  if (!isAdmin) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="font-mono text-5xl font-bold mb-4" style={{ color: "var(--red)" }}>403</p>
          <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Access Denied</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            You don&apos;t have permission to access the admin dashboard.
          </p>
        </div>
      </DashboardShell>
    );
  }

  // Group scrapers by schedule_group
  const groups = scrapers.reduce<Record<string, ScraperStatus[]>>((acc, s) => {
    const g = s.schedule_group || "other";
    if (!acc[g]) acc[g] = [];
    acc[g].push(s);
    return acc;
  }, {});

  const cardStyle = { backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" };

  return (
    <DashboardShell>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>Admin Dashboard</h1>

      {/* Lifecycle Stats */}
      {lifecycle && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {(Object.keys(LIFECYCLE_CONFIG) as Array<keyof typeof LIFECYCLE_CONFIG>).map((key) => (
            <div key={key} className="rounded-xl p-4" style={cardStyle}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>{key}</p>
              <p className="text-2xl font-bold" style={{ color: LIFECYCLE_CONFIG[key].color }}>
                {lifecycle[key as keyof LifecycleStats]?.toLocaleString() || 0}
              </p>
            </div>
          ))}
          <div className="rounded-xl p-4" style={cardStyle}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Total</p>
            <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{lifecycle.total.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Scraper Groups */}
      <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Scraper Status</h2>
      <div className="space-y-6">
        {Object.entries(groups).map(([group, groupScrapers]) => (
          <div key={group} className="rounded-xl overflow-hidden" style={cardStyle}>
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <div>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>{GROUP_LABELS[group] || group}</span>
                <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>{group}</span>
              </div>
              <button
                onClick={() => triggerGroup(group)}
                disabled={triggering === group}
                className="px-3 py-1 text-xs rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ backgroundColor: "var(--cyan)", color: "var(--bg-void)" }}
              >
                {triggering === group ? "Running..." : "Run Now"}
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <th className="px-4 py-2 text-left" style={{ color: "var(--text-muted)" }}>Scraper</th>
                  <th className="px-4 py-2 text-left" style={{ color: "var(--text-muted)" }}>Status</th>
                  <th className="px-4 py-2 text-left" style={{ color: "var(--text-muted)" }}>Last Run</th>
                  <th className="px-4 py-2 text-left" style={{ color: "var(--text-muted)" }}>Jobs Found</th>
                  <th className="px-4 py-2 text-left" style={{ color: "var(--text-muted)" }}>Interval</th>
                </tr>
              </thead>
              <tbody>
                {groupScrapers.map((s) => (
                  <tr key={s.scraper_name} className="transition-colors" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td className="px-4 py-2 font-medium" style={{ color: "var(--text-primary)" }}>{s.scraper_name}</td>
                    <td className="px-4 py-2">
                      {s.last_status ? (
                        <span
                          className="px-2 py-0.5 rounded text-xs"
                          style={{
                            backgroundColor: s.last_status === "success" ? "var(--green-08)" : "var(--red-08)",
                            color: s.last_status === "success" ? "var(--green)" : "var(--red)",
                          }}
                        >
                          {s.last_status}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>never run</span>
                      )}
                    </td>
                    <td className="px-4 py-2" style={{ color: "var(--text-secondary)" }}>
                      {s.last_run_at ? new Date(s.last_run_at + "Z").toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2" style={{ color: "var(--text-secondary)" }}>{s.last_jobs_found}</td>
                    <td className="px-4 py-2" style={{ color: "var(--text-muted)" }}>{s.interval_hours}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Manual trigger for lifecycle */}
      <div className="mt-6">
        <button
          onClick={() => triggerGroup("lifecycle_maintenance")}
          disabled={triggering === "lifecycle_maintenance"}
          className="px-4 py-2 text-sm rounded-lg disabled:opacity-50 transition-colors"
          style={{ backgroundColor: "var(--gold-08)", color: "var(--gold)", border: "1px solid var(--gold-15)" }}
        >
          {triggering === "lifecycle_maintenance" ? "Running Lifecycle..." : "Run Lifecycle Maintenance"}
        </button>
      </div>
    </DashboardShell>
  );
}
