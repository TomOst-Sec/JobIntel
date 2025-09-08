"use client";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface ReportMeta {
  id: number;
  report_type: string;
  market_id: string | null;
  created_at: string;
}

export default function ReportsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    api.get<ReportMeta[]>("/reports").then(setReports).catch(() => {});
  }, []);

  const generateReport = async () => {
    setGenerating(true);
    try {
      const report = await api.post<ReportMeta>("/reports");
      setReports([report, ...reports]);
    } catch {} finally {
      setGenerating(false);
    }
  };

  if (loading || !user) return null;

  return (
    <DashboardShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Reports</h1>
        <Button onClick={generateReport} disabled={generating}>
          {generating ? "Generating..." : "Generate Report"}
        </Button>
      </div>
      <div className="space-y-3">
        {reports.map((r) => (
          <div
            key={r.id}
            className="rounded-xl p-5 flex items-center justify-between"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
          >
            <div>
              <p className="font-medium" style={{ color: "var(--text-primary)" }}>{r.report_type} Report</p>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{new Date(r.created_at).toLocaleString()}</p>
            </div>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{r.market_id || "All markets"}</span>
          </div>
        ))}
        {reports.length === 0 && (
          <p className="text-center py-12" style={{ color: "var(--text-muted)" }}>No reports yet.</p>
        )}
      </div>
    </DashboardShell>
  );
}
