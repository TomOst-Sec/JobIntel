"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Button } from "@/components/ui/button";

interface Milestone { year: number; role: string; salary: number; description: string }
interface Trajectory {
  id?: number; target_role: string; trajectory_type: string; milestones: Milestone[];
  salary_projections: { year: number; salary: number }[]; success_probability: number; created_at?: string;
}
interface Scenario {
  type: string; role: string; salary: number; probability: number;
  key_moves: string[]; risks?: string[]; stability_factors?: string[];
}
interface FutureSelf { years_ahead: number; scenarios: Scenario[] }
interface SkillGap { skill: string; importance: string; current: boolean }
interface GapAnalysis {
  target_role: string; readiness_pct: number; missing_skills: SkillGap[];
  experience_gaps: string[]; certifications: string[];
  timeline: { aggressive: string; balanced: string; conservative: string };
}
type TabId = "trajectory" | "future" | "gaps";

const fmt$ = (n: number) => "$" + n.toLocaleString("en-US");
const pCol = (p: number) => (p >= 70 ? "var(--green)" : p >= 40 ? "var(--gold)" : "var(--red)");
const card = { background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" };
const inp = { background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" };

export default function CareerSimulatorPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("trajectory");
  const [targetRole, setTargetRole] = useState("");
  const [trajectoryType, setTrajectoryType] = useState("balanced");
  const [trajectory, setTrajectory] = useState<Trajectory | null>(null);
  const [trajectories, setTrajectories] = useState<Trajectory[]>([]);
  const [loadingTraj, setLoadingTraj] = useState(false);
  const [yearsAhead, setYearsAhead] = useState(5);
  const [futureSelf, setFutureSelf] = useState<FutureSelf | null>(null);
  const [loadingFuture, setLoadingFuture] = useState(false);
  const [gapRole, setGapRole] = useState("");
  const [gaps, setGaps] = useState<GapAnalysis | null>(null);
  const [loadingGaps, setLoadingGaps] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (!authLoading && !user) router.replace("/login"); }, [user, authLoading, router]);
  useEffect(() => { api.get<Trajectory[]>("/career/trajectories").then(setTrajectories).catch(() => {}); }, []);

  const predict = useCallback(async () => {
    if (!targetRole.trim()) return;
    setLoadingTraj(true); setError("");
    try {
      const res = await api.post<Trajectory>("/career/trajectory", { target_role: targetRole, trajectory_type: trajectoryType });
      setTrajectory(res); setTrajectories((p) => [res, ...p]);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Prediction failed"); }
    finally { setLoadingTraj(false); }
  }, [targetRole, trajectoryType]);

  const simulate = useCallback(async () => {
    setLoadingFuture(true); setError("");
    try { setFutureSelf(await api.post<FutureSelf>("/career/future-self", { years_ahead: yearsAhead })); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Simulation failed"); }
    finally { setLoadingFuture(false); }
  }, [yearsAhead]);

  const analyzeGaps = useCallback(async () => {
    if (!gapRole.trim()) return;
    setLoadingGaps(true); setError("");
    try { setGaps(await api.post<GapAnalysis>("/career/gaps", { target_role: gapRole })); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Analysis failed"); }
    finally { setLoadingGaps(false); }
  }, [gapRole]);

  if (authLoading || !user) return null;
  const tabs: { id: TabId; label: string }[] = [
    { id: "trajectory", label: "Trajectory" }, { id: "future", label: "Future Self" }, { id: "gaps", label: "Gap Analysis" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-deep)" }}>
      <TopNav />
      <main className="max-w-6xl mx-auto px-4 pt-20 pb-28 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Career Simulator</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>AI-powered trajectory prediction, future-self simulation, and gap analysis</p>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--bg-surface)" }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setError(""); }}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: tab === t.id ? "var(--cyan-15)" : "transparent", color: tab === t.id ? "var(--cyan)" : "var(--text-muted)" }}>
              {t.label}
            </button>
          ))}
        </div>
        {error && <div className="p-3 rounded-lg text-sm" style={{ background: "var(--red-15)", color: "var(--red)" }}>{error}</div>}

        {/* ── Trajectory ── */}
        {tab === "trajectory" && (
          <div className="space-y-6">
            <div className="p-5 rounded-xl space-y-4" style={card}>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Target Role <span style={{ color: "var(--red)" }}>*</span></label>
                <input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} onKeyDown={(e) => e.key === "Enter" && predict()}
                  placeholder="e.g. VP of Engineering" className="w-full px-3 py-2 rounded-lg text-sm" style={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Trajectory Type</label>
                <div className="flex gap-3">
                  {(["aggressive", "balanced", "conservative"] as const).map((t) => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="ttype" value={t} checked={trajectoryType === t} onChange={() => setTrajectoryType(t)} className="accent-[var(--cyan)]" />
                      <span className="text-sm capitalize" style={{ color: trajectoryType === t ? "var(--text-primary)" : "var(--text-muted)" }}>{t}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button onClick={predict} disabled={loadingTraj || !targetRole.trim()}>{loadingTraj ? "Predicting..." : "Predict"}</Button>
            </div>
            {trajectory && (
              <div className="space-y-5">
                {/* Gauge */}
                <div className="p-5 rounded-xl flex items-center gap-6" style={card}>
                  <div className="relative" style={{ width: 90, height: 90 }}>
                    <svg width={90} height={90} className="-rotate-90">
                      <circle cx={45} cy={45} r={38} fill="none" stroke="var(--border-subtle)" strokeWidth={7} />
                      <circle cx={45} cy={45} r={38} fill="none" stroke={pCol(trajectory.success_probability)} strokeWidth={7} strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 38} strokeDashoffset={2 * Math.PI * 38 * (1 - trajectory.success_probability / 100)}
                        style={{ transition: "stroke-dashoffset 0.8s ease-out" }} />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-bold tabular-nums" style={{ color: pCol(trajectory.success_probability) }}>{trajectory.success_probability}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Success Probability</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{trajectory.trajectory_type} path to {trajectory.target_role}</p>
                  </div>
                </div>
                {/* Timeline */}
                <div className="p-5 rounded-xl" style={card}>
                  <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>Milestone Timeline</h3>
                  <div className="relative pl-6">
                    <div className="absolute left-2 top-2 bottom-2 w-px" style={{ backgroundColor: "var(--cyan)" }} />
                    {trajectory.milestones.map((m, i) => (
                      <div key={i} className="relative flex gap-4 pb-5 last:pb-0">
                        <div className="absolute -left-4 top-1 w-3 h-3 rounded-full border-2 z-10" style={{ borderColor: "var(--cyan)", backgroundColor: "var(--bg-deep)" }} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-semibold" style={{ color: "var(--cyan)" }}>Year {m.year}</span>
                            <span className="text-xs font-mono" style={{ color: "var(--green)" }}>{fmt$(m.salary)}</span>
                          </div>
                          <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-primary)" }}>{m.role}</p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{m.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Salary bars */}
                {trajectory.salary_projections.length > 0 && (
                  <div className="p-5 rounded-xl" style={card}>
                    <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>Salary Projections</h3>
                    <div className="space-y-3">
                      {trajectory.salary_projections.map((sp) => {
                        const max = Math.max(...trajectory.salary_projections.map((s) => s.salary));
                        return (
                          <div key={sp.year} className="flex items-center gap-3">
                            <span className="text-xs font-mono w-14 shrink-0" style={{ color: "var(--text-muted)" }}>Year {sp.year}</span>
                            <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-elevated)" }}>
                              <div className="h-full rounded-full" style={{ width: `${max > 0 ? (sp.salary / max) * 100 : 0}%`, backgroundColor: "var(--green)", transition: "width 0.6s ease-out" }} />
                            </div>
                            <span className="text-xs font-mono font-medium w-20 text-right" style={{ color: "var(--green)" }}>{fmt$(sp.salary)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {trajectories.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Previous Trajectories</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  {trajectories.map((t, i) => (
                    <button key={t.id ?? i} onClick={() => setTrajectory(t)} className="text-left p-4 rounded-xl" style={card}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{t.target_role}</span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ background: "var(--cyan-15)", color: "var(--cyan)" }}>{t.trajectory_type}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs" style={{ color: pCol(t.success_probability) }}>{t.success_probability}% success</span>
                        {t.created_at && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Future Self ── */}
        {tab === "future" && (
          <div className="space-y-6">
            <div className="p-5 rounded-xl space-y-4" style={card}>
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                  Years Ahead: <span className="font-mono" style={{ color: "var(--cyan)" }}>{yearsAhead}</span>
                </label>
                <input type="range" min={1} max={10} value={yearsAhead} onChange={(e) => setYearsAhead(Number(e.target.value))} className="w-full accent-[var(--cyan)]" />
                <div className="flex justify-between text-[10px] mt-1" style={{ color: "var(--text-muted)" }}><span>1 year</span><span>10 years</span></div>
              </div>
              <Button onClick={simulate} disabled={loadingFuture}>{loadingFuture ? "Simulating..." : "Simulate"}</Button>
            </div>
            {futureSelf && futureSelf.scenarios.length > 0 && (
              <div className="grid md:grid-cols-3 gap-4">
                {futureSelf.scenarios.map((s) => {
                  const ac = s.type === "aggressive" ? "var(--red)" : s.type === "balanced" ? "var(--cyan)" : "var(--green)";
                  const bg = s.type === "aggressive" ? "var(--red-15)" : s.type === "balanced" ? "var(--cyan-15)" : "var(--green-15)";
                  return (
                    <div key={s.type} className="rounded-xl p-5 space-y-4" style={{ ...card, borderTop: `3px solid ${ac}` }}>
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold capitalize" style={{ color: ac }}>{s.type}</h3>
                        <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ background: bg, color: ac }}>{s.probability}%</span>
                      </div>
                      <div>
                        <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{s.role}</p>
                        <p className="text-sm font-mono mt-1" style={{ color: "var(--green)" }}>{fmt$(s.salary)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Key Moves</p>
                        {s.key_moves.map((m, i) => <p key={i} className="text-xs" style={{ color: "var(--text-secondary)" }}><span style={{ color: ac }}>-</span> {m}</p>)}
                      </div>
                      {s.risks && s.risks.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--red)" }}>Risks</p>
                          {s.risks.map((r, i) => <p key={i} className="text-xs" style={{ color: "var(--text-muted)" }}>- {r}</p>)}
                        </div>
                      )}
                      {s.stability_factors && s.stability_factors.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--green)" }}>Stability</p>
                          {s.stability_factors.map((f, i) => <p key={i} className="text-xs" style={{ color: "var(--text-muted)" }}>- {f}</p>)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Gap Analysis ── */}
        {tab === "gaps" && (
          <div className="space-y-6">
            <div className="p-5 rounded-xl space-y-4" style={card}>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Target Role <span style={{ color: "var(--red)" }}>*</span></label>
                <input value={gapRole} onChange={(e) => setGapRole(e.target.value)} onKeyDown={(e) => e.key === "Enter" && analyzeGaps()}
                  placeholder="e.g. Staff Engineer" className="w-full px-3 py-2 rounded-lg text-sm" style={inp} />
              </div>
              <Button onClick={analyzeGaps} disabled={loadingGaps || !gapRole.trim()}>{loadingGaps ? "Analyzing..." : "Analyze"}</Button>
            </div>
            {gaps && (
              <div className="space-y-5">
                <div className="p-5 rounded-xl" style={card}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Current Readiness for {gaps.target_role}</h3>
                    <span className="text-lg font-bold font-mono" style={{ color: pCol(gaps.readiness_pct) }}>{gaps.readiness_pct}%</span>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-elevated)" }}>
                    <div className="h-full rounded-full" style={{ width: `${gaps.readiness_pct}%`, backgroundColor: pCol(gaps.readiness_pct), transition: "width 0.6s ease-out" }} />
                  </div>
                </div>
                {gaps.missing_skills.length > 0 && (
                  <div className="p-5 rounded-xl" style={card}>
                    <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Missing Skills</h3>
                    {gaps.missing_skills.map((s, i) => {
                      const c = s.importance === "critical" ? { bg: "var(--red-15)", fg: "var(--red)" } : s.importance === "high" ? { bg: "var(--gold-15)", fg: "var(--gold)" } : { bg: "var(--cyan-15)", fg: "var(--cyan)" };
                      return (
                        <div key={i} className="flex items-center justify-between py-1.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <span className="text-sm" style={{ color: "var(--text-primary)" }}>{s.skill}</span>
                          <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.fg }}>{s.importance}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {gaps.experience_gaps.length > 0 && (
                  <div className="p-5 rounded-xl" style={card}>
                    <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Experience Gaps</h3>
                    {gaps.experience_gaps.map((g, i) => <p key={i} className="text-sm" style={{ color: "var(--text-secondary)" }}><span style={{ color: "var(--gold)" }}>-</span> {g}</p>)}
                  </div>
                )}
                {gaps.certifications.length > 0 && (
                  <div className="p-5 rounded-xl" style={card}>
                    <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Recommended Certifications</h3>
                    <div className="flex flex-wrap gap-2">
                      {gaps.certifications.map((c, i) => <span key={i} className="text-xs px-3 py-1 rounded-full" style={{ background: "var(--green-15)", color: "var(--green)" }}>{c}</span>)}
                    </div>
                  </div>
                )}
                <div className="p-5 rounded-xl" style={card}>
                  <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Timeline to Ready</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {(["aggressive", "balanced", "conservative"] as const).map((t) => {
                      const c = t === "aggressive" ? "var(--red)" : t === "balanced" ? "var(--cyan)" : "var(--green)";
                      return (
                        <div key={t} className="text-center p-3 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                          <p className="text-xs font-semibold capitalize" style={{ color: c }}>{t}</p>
                          <p className="text-lg font-bold font-mono mt-1" style={{ color: "var(--text-primary)" }}>{gaps.timeline[t]}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      <MobileNav />
    </div>
  );
}
