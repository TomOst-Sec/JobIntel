"use client";
import { useState } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface CVAnalysis {
  market_position_score: number | null;
  skills_gap: string[];
  salary_estimate_min: number | null;
  salary_estimate_max: number | null;
  recommended_roles: string[];
  ai_narrative: string | null;
}

export default function CVPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<CVAnalysis | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const cv = await api.upload<{ id: number }>("/cv/upload", file);
      setUploading(false);
      setAnalyzing(true);
      const result = await api.post<CVAnalysis>(`/cv/analyze/${cv.id}`);
      setAnalysis(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setAnalyzing(false);
    }
  };

  if (loading || !user) return null;

  const cardStyle = { backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" };

  return (
    <DashboardShell>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>CV Analysis</h1>
      {!analysis ? (
        <div className="rounded-xl p-12 text-center" style={cardStyle}>
          <p className="text-4xl mb-4">📄</p>
          <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Upload your CV</h2>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>Get a Market Position Score and personalized career insights.</p>
          {error && <p className="text-sm mb-4" style={{ color: "var(--red)" }}>{error}</p>}
          <label>
            <input type="file" accept=".pdf,.docx" onChange={handleUpload} className="hidden" />
            <span
              className="inline-flex items-center justify-center font-medium rounded-lg px-5 py-2.5 text-sm cursor-pointer transition-colors"
              style={{ backgroundColor: "var(--cyan)", color: "var(--bg-void)" }}
            >
              {uploading ? "Uploading..." : analyzing ? "Analyzing with AI..." : "Choose PDF or DOCX"}
            </span>
          </label>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Score */}
          {analysis.market_position_score !== null && (
            <div className="rounded-xl p-8 text-center" style={cardStyle}>
              <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>Market Position Score</p>
              <p className="text-6xl font-bold" style={{ color: "var(--cyan)" }}>{analysis.market_position_score}</p>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>out of 100</p>
            </div>
          )}
          {/* Salary Estimate */}
          {analysis.salary_estimate_min && (
            <div className="rounded-xl p-6" style={cardStyle}>
              <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Estimated Salary Range</h3>
              <p className="text-2xl font-bold" style={{ color: "var(--green)" }}>
                ${analysis.salary_estimate_min.toLocaleString()} — ${analysis.salary_estimate_max?.toLocaleString()}
              </p>
            </div>
          )}
          {/* Skills Gap */}
          {analysis.skills_gap.length > 0 && (
            <div className="rounded-xl p-6" style={cardStyle}>
              <h3 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Skills to Develop</h3>
              <div className="flex flex-wrap gap-2">
                {analysis.skills_gap.map((s) => (
                  <span key={s} className="px-3 py-1 rounded-full text-sm" style={{ backgroundColor: "var(--red-08)", color: "var(--red)" }}>{s}</span>
                ))}
              </div>
            </div>
          )}
          {/* Recommended Roles */}
          {analysis.recommended_roles.length > 0 && (
            <div className="rounded-xl p-6" style={cardStyle}>
              <h3 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Recommended Roles</h3>
              <div className="flex flex-wrap gap-2">
                {analysis.recommended_roles.map((r) => (
                  <span key={r} className="px-3 py-1 rounded-full text-sm" style={{ backgroundColor: "var(--cyan-15)", color: "var(--cyan)" }}>{r}</span>
                ))}
              </div>
            </div>
          )}
          {/* Narrative */}
          {analysis.ai_narrative && (
            <div className="rounded-xl p-6" style={cardStyle}>
              <h3 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary)" }}>AI Career Assessment</h3>
              <p className="whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{analysis.ai_narrative}</p>
            </div>
          )}
          <Button variant="secondary" onClick={() => setAnalysis(null)}>Upload Another CV</Button>
        </div>
      )}
    </DashboardShell>
  );
}
