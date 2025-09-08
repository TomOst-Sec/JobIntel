"use client";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";

interface Signal {
  company: string;
  market_id: string;
  total_postings: number;
  unique_categories: number;
  categories: string;
}

export default function SignalsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [signals, setSignals] = useState<Signal[]>([]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      fetch("/api/v1/jobs/scaling-companies?min_postings=3", {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()).then(setSignals).catch(() => {});
    }
  }, []);

  if (loading || !user) return null;

  return (
    <DashboardShell>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>Hiring Signals</h1>
      <div className="grid gap-4">
        {signals.map((s, i) => (
          <div
            key={i}
            className="rounded-xl p-5 flex items-center justify-between"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
          >
            <div>
              <h3 className="font-semibold text-lg" style={{ color: "var(--text-primary)" }}>{s.company}</h3>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{s.market_id.replace(/_/g, " ")} &middot; {s.categories}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold" style={{ color: "var(--red)" }}>{s.total_postings}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>open roles this week</p>
            </div>
          </div>
        ))}
        {signals.length === 0 && (
          <p className="text-center py-12" style={{ color: "var(--text-muted)" }}>No signals detected yet.</p>
        )}
      </div>
    </DashboardShell>
  );
}
