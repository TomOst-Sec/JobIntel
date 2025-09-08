"use client";
import { useState, useEffect } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface Job {
  company: string;
  title: string;
  location: string;
  posted_at: string;
  is_remote: boolean;
}

export default function SeekerCompaniesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    fetch("/api/v1/jobs?per_page=50")
      .then((r) => r.json())
      .then((data) => setJobs(data.items || []))
      .catch(() => {});
  }, []);

  // Group by company
  const companyMap = new Map<string, Job[]>();
  jobs.forEach((j) => {
    const list = companyMap.get(j.company) || [];
    list.push(j);
    companyMap.set(j.company, list);
  });
  const companies = Array.from(companyMap.entries()).sort((a, b) => b[1].length - a[1].length);

  if (loading || !user) return null;

  return (
    <DashboardShell>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>Companies Hiring</h1>
      <div className="space-y-4">
        {companies.map(([name, compJobs]) => (
          <div
            key={name}
            className="rounded-xl p-5"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>{name}</h3>
              <span className="text-sm" style={{ color: "var(--cyan)" }}>{compJobs.length} role{compJobs.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="space-y-1">
              {compJobs.slice(0, 3).map((j, i) => (
                <p key={i} className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {j.title} &middot; {j.location || "Remote"}
                </p>
              ))}
              {compJobs.length > 3 && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>+{compJobs.length - 3} more</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
