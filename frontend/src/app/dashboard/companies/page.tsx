"use client";
import { useState } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface CompanyIntel {
  company: string;
  total_jobs: number;
  markets: string[];
  categories: string[];
  avg_salary_min: number | null;
  avg_salary_max: number | null;
  remote_pct: number | null;
}

export default function CompaniesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState<CompanyIntel | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  const searchCompany = async () => {
    if (!search.trim()) return;
    setError("");
    try {
      const data = await api.get<CompanyIntel>(`/companies/${encodeURIComponent(search)}`);
      setCompany(data);
    } catch {
      setError("Company not found. Try a different name.");
      setCompany(null);
    }
  };

  if (loading || !user) return null;

  return (
    <DashboardShell>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>Company Deep Dive</h1>
      <div className="flex gap-3 mb-8">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchCompany()}
          placeholder="Search company name..."
          className="flex-1 rounded-xl px-4 py-3 outline-none transition-colors"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--cyan)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
        />
        <Button onClick={searchCompany}>Search</Button>
      </div>
      {error && <p className="mb-4" style={{ color: "var(--red)" }}>{error}</p>}
      {company && (
        <div className="rounded-xl p-6 space-y-4" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
          <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{company.company}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p style={{ color: "var(--text-secondary)" }}>Total Jobs</p><p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{company.total_jobs}</p></div>
            <div><p style={{ color: "var(--text-secondary)" }}>Remote %</p><p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{company.remote_pct || 0}%</p></div>
            <div><p style={{ color: "var(--text-secondary)" }}>Avg Salary Min</p><p className="text-lg font-bold" style={{ color: "var(--green)" }}>{company.avg_salary_min ? `$${company.avg_salary_min.toLocaleString()}` : "N/A"}</p></div>
            <div><p style={{ color: "var(--text-secondary)" }}>Avg Salary Max</p><p className="text-lg font-bold" style={{ color: "var(--green)" }}>{company.avg_salary_max ? `$${company.avg_salary_max.toLocaleString()}` : "N/A"}</p></div>
          </div>
          <div>
            <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>Markets</p>
            <div className="flex flex-wrap gap-2">
              {company.markets.map((m) => (
                <span key={m} className="px-3 py-1 rounded-full text-sm" style={{ backgroundColor: "var(--cyan-15)", color: "var(--cyan)" }}>{m}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>Hiring Categories</p>
            <div className="flex flex-wrap gap-2">
              {company.categories.map((c) => (
                <span key={c} className="px-3 py-1 rounded-full text-sm" style={{ backgroundColor: "var(--purple-08)", color: "var(--purple)" }}>{c}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
