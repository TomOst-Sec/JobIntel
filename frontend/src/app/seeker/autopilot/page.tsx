"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

/* ── Types ───────────────────────────────────────────── */
interface AutopilotSettings {
  is_enabled: number; mode: string;
  target_roles: string[]; target_locations: string[];
  salary_floor: number | null; exclude_companies: string[];
  require_salary_disclosed: number; max_ghost_score: number;
  min_match_score: number; max_applications_per_day: number;
  max_per_company: number; cooldown_same_company_days: number;
  run_time: string;
}
interface Briefing {
  briefing: { highlights: string[]; action_items: string[]; new_opportunities: string[]; streak_status: string; motivation: string };
  data: { streak: { streak_days?: number; streak_best?: number } };
}
interface RunHistory {
  id: number; run_date: string; jobs_found: number; jobs_qualified: number;
  applications_submitted: number; applications_failed: number;
}
interface QueuedApp {
  id: number; job_id: number; job_company: string; job_title: string;
  company: string; title: string; match_score: number | null;
}

type Mode = "full_auto" | "pre_approve" | "materials_only";
type BottomTab = "history" | "queued";

const MODES: { key: Mode; label: string; desc: string }[] = [
  { key: "full_auto", label: "Full Auto", desc: "Apply automatically to matching jobs" },
  { key: "pre_approve", label: "Pre-Approve", desc: "Queue jobs for your review before applying" },
  { key: "materials_only", label: "Materials Only", desc: "Just prepare CVs and cover letters" },
];

const card = { backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)" } as const;
const inputBase = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", backgroundColor: "var(--bg-deep)", color: "var(--text-primary)", fontSize: 14, outline: "none" } as const;
const labelCls = "block mb-1 text-xs font-medium";
const labelStyle = { color: "var(--text-secondary)" };

/* ════════════════════════════════════════════════════════ */
export default function AutopilotPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [settings, setSettings] = useState<AutopilotSettings | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [runs, setRuns] = useState<RunHistory[]>([]);
  const [queued, setQueued] = useState<QueuedApp[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bottomTab, setBottomTab] = useState<BottomTab>("history");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [approving, setApproving] = useState(false);
  const [refreshingBriefing, setRefreshingBriefing] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ roles: true, filters: false, limits: false, schedule: false });

  // Form fields
  const [targetRolesText, setTargetRolesText] = useState("");
  const [targetLocsText, setTargetLocsText] = useState("");
  const [salaryFloor, setSalaryFloor] = useState("");
  const [maxGhost, setMaxGhost] = useState(40);
  const [minMatch, setMinMatch] = useState(70);
  const [maxPerDay, setMaxPerDay] = useState(10);
  const [maxPerCo, setMaxPerCo] = useState(1);
  const [cooldown, setCooldown] = useState(90);
  const [excludeText, setExcludeText] = useState("");
  const [requireSalary, setRequireSalary] = useState(false);
  const [runTime, setRunTime] = useState("02:00");

  /* ── Loaders ──────────────────────────────────────── */
  const loadSettings = useCallback(async () => {
    try {
      const s = await api.get<AutopilotSettings>("/autopilot/settings");
      setSettings(s);
      setTargetRolesText((s.target_roles ?? []).join("\n"));
      setTargetLocsText((s.target_locations ?? []).join("\n"));
      setSalaryFloor(s.salary_floor != null ? String(s.salary_floor) : "");
      setMaxGhost(Math.round((s.max_ghost_score ?? 0.4) * 100));
      setMinMatch(Math.round((s.min_match_score ?? 0.7) * 100));
      setMaxPerDay(s.max_applications_per_day ?? 10);
      setMaxPerCo(s.max_per_company ?? 1);
      setCooldown(s.cooldown_same_company_days ?? 90);
      setExcludeText((s.exclude_companies ?? []).join("\n"));
      setRequireSalary(!!s.require_salary_disclosed);
      setRunTime(s.run_time ?? "02:00");
    } catch { /* first load */ }
  }, []);
  const loadBriefing = useCallback(async () => { try { setBriefing(await api.get<Briefing>("/autopilot/briefing")); } catch {} }, []);
  const loadHistory = useCallback(async () => { try { const h = await api.get<{ runs: RunHistory[] }>("/autopilot/history"); setRuns(h.runs ?? []); } catch {} }, []);
  const loadQueued = useCallback(async () => { try { const q = await api.get<{ queued: QueuedApp[] }>("/autopilot/queued"); setQueued(q.queued ?? []); } catch {} }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    loadSettings(); loadBriefing(); loadHistory(); loadQueued();
  }, [user, authLoading, router, loadSettings, loadBriefing, loadHistory, loadQueued]);

  /* ── Actions ──────────────────────────────────────── */
  const toggleEnabled = async () => {
    if (!settings) return;
    setSettings(await api.put<AutopilotSettings>("/autopilot/settings", { is_enabled: settings.is_enabled ? 0 : 1 }));
  };
  const pickMode = async (mode: Mode) => { setSettings(await api.put<AutopilotSettings>("/autopilot/settings", { mode })); };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const lines = (t: string) => t.split("\n").map(s => s.trim()).filter(Boolean);
      setSettings(await api.put<AutopilotSettings>("/autopilot/settings", {
        target_roles: lines(targetRolesText), target_locations: lines(targetLocsText),
        salary_floor: salaryFloor ? parseFloat(salaryFloor) : null,
        max_ghost_score: maxGhost / 100, min_match_score: minMatch / 100,
        max_applications_per_day: maxPerDay, max_per_company: maxPerCo,
        cooldown_same_company_days: cooldown,
        exclude_companies: lines(excludeText),
        require_salary_disclosed: requireSalary ? 1 : 0, run_time: runTime,
      }));
    } finally { setSaving(false); }
  };

  const triggerRun = async () => {
    setRunning(true);
    try { await api.post("/autopilot/run"); await loadHistory(); await loadQueued(); } finally { setRunning(false); }
  };
  const refreshBrief = async () => { setRefreshingBriefing(true); try { await loadBriefing(); } finally { setRefreshingBriefing(false); } };

  const toggleSelect = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => setSelected(selected.size === queued.length ? new Set() : new Set(queued.map(q => q.id)));

  const approveSelected = async () => {
    if (!selected.size) return;
    setApproving(true);
    try { await api.post("/autopilot/approve", { application_ids: [...selected] }); setSelected(new Set()); await loadQueued(); } finally { setApproving(false); }
  };
  const approveSingle = async (id: number) => {
    await api.post("/autopilot/approve", { application_ids: [id] });
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    await loadQueued();
  };

  /* ── Derived ──────────────────────────────────────── */
  const isOn = !!(settings?.is_enabled);
  const mode = (settings?.mode ?? "pre_approve") as Mode;
  const statusLabel = isOn ? "ACTIVE" : settings ? "OFF" : "LOADING";
  const statusColor = isOn ? "var(--green)" : settings ? "var(--red)" : "var(--gold)";

  if (authLoading || !user) return null;

  /* ── RENDER ───────────────────────────────────────── */
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-deep)" }}>
      <TopNav />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Autopilot Control Center</h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>SKYNET autonomous application engine</p>
          </div>
          <button type="button" onClick={triggerRun} disabled={running || !isOn}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200"
            style={{ backgroundColor: isOn ? "var(--cyan)" : "var(--bg-surface)", color: isOn ? "#000" : "var(--text-muted)", opacity: running ? 0.6 : 1, cursor: running || !isOn ? "not-allowed" : "pointer" }}>
            {running ? "Running..." : "Manual Run"}
          </button>
        </div>

        {/* ── SECTION 1: CONTROL PANEL ─────────────────── */}
        <div style={{ ...card, padding: 24 }} className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex items-center gap-4">
              <button type="button" role="switch" aria-checked={isOn} onClick={toggleEnabled}
                className="relative w-16 h-8 rounded-full transition-colors duration-300"
                style={{ backgroundColor: isOn ? "var(--cyan)" : "var(--bg-elevated)", border: `2px solid ${isOn ? "var(--cyan)" : "var(--border-subtle)"}` }}>
                <span className="absolute top-0.5 w-6 h-6 rounded-full transition-transform duration-300"
                  style={{ backgroundColor: isOn ? "#000" : "var(--text-muted)", transform: isOn ? "translateX(32px)" : "translateX(4px)" }} />
              </button>
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Autopilot {isOn ? "ON" : "OFF"}</span>
              <span className="px-3 py-1 rounded-full text-xs font-bold tracking-wider" style={{ backgroundColor: `${statusColor}22`, color: statusColor }}>{statusLabel}</span>
            </div>
            <div className="flex flex-1 gap-3 flex-wrap">
              {MODES.map(m => {
                const active = mode === m.key;
                return (
                  <button key={m.key} type="button" onClick={() => pickMode(m.key)}
                    className="flex-1 min-w-[160px] p-4 rounded-xl text-left transition-all duration-200"
                    style={{ backgroundColor: active ? "var(--bg-elevated)" : "var(--bg-deep)", border: `2px solid ${active ? "var(--cyan)" : "var(--border-subtle)"}` }}>
                    <div className="text-sm font-semibold mb-1" style={{ color: active ? "var(--cyan)" : "var(--text-primary)" }}>{m.label}</div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>{m.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── SECTION 2: SETTINGS (60%) + BRIEFING (40%) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
          <div className="lg:col-span-3" style={{ ...card, padding: 24 }}>
            <h2 className="text-lg font-bold mb-4" style={{ color: "var(--text-primary)" }}>Settings</h2>

            <Collapse title="Target Roles & Locations" open={expanded.roles} onToggle={() => setExpanded(p => ({ ...p, roles: !p.roles }))}>
              <label className={labelCls} style={labelStyle}>Target Roles (one per line)</label>
              <textarea rows={4} value={targetRolesText} onChange={e => setTargetRolesText(e.target.value)}
                placeholder={"Senior Frontend Engineer\nFullstack Developer\nReact Lead"} style={{ ...inputBase, resize: "vertical" }} />
              <label className={`${labelCls} mt-4`} style={labelStyle}>Target Locations (one per line)</label>
              <textarea rows={3} value={targetLocsText} onChange={e => setTargetLocsText(e.target.value)}
                placeholder={"Remote\nNew York, NY\nSan Francisco, CA"} style={{ ...inputBase, resize: "vertical" }} />
            </Collapse>

            <Collapse title="Filters" open={expanded.filters} onToggle={() => setExpanded(p => ({ ...p, filters: !p.filters }))}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} style={labelStyle}>Salary Floor ($)</label>
                  <input type="number" value={salaryFloor} onChange={e => setSalaryFloor(e.target.value)} placeholder="80000" style={inputBase} />
                </div>
                <div>
                  <label className="flex items-center gap-2 mt-5 text-xs font-medium cursor-pointer" style={labelStyle}>
                    <input type="checkbox" checked={requireSalary} onChange={e => setRequireSalary(e.target.checked)} className="w-4 h-4 rounded accent-[var(--cyan)]" />
                    Require Salary Disclosed
                  </label>
                </div>
              </div>
              <div className="mt-4">
                <label className={labelCls} style={labelStyle}>Max Ghost Score: {maxGhost}%</label>
                <input type="range" min={0} max={100} value={maxGhost} onChange={e => setMaxGhost(+e.target.value)} className="w-full accent-[var(--cyan)]" />
              </div>
              <div className="mt-4">
                <label className={labelCls} style={labelStyle}>Min Match Score: {minMatch}%</label>
                <input type="range" min={0} max={100} value={minMatch} onChange={e => setMinMatch(+e.target.value)} className="w-full accent-[var(--cyan)]" />
              </div>
              <label className={`${labelCls} mt-4`} style={labelStyle}>Exclude Companies (one per line)</label>
              <textarea rows={3} value={excludeText} onChange={e => setExcludeText(e.target.value)} placeholder={"Acme Corp\nInitech"} style={{ ...inputBase, resize: "vertical" }} />
            </Collapse>

            <Collapse title="Rate Limits" open={expanded.limits} onToggle={() => setExpanded(p => ({ ...p, limits: !p.limits }))}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls} style={labelStyle}>Max Per Day (1-50)</label>
                  <input type="number" min={1} max={50} value={maxPerDay} onChange={e => setMaxPerDay(+e.target.value)} style={inputBase} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Max Per Company</label>
                  <input type="number" min={1} max={10} value={maxPerCo} onChange={e => setMaxPerCo(+e.target.value)} style={inputBase} />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Cooldown (days)</label>
                  <input type="number" min={0} max={365} value={cooldown} onChange={e => setCooldown(+e.target.value)} style={inputBase} />
                </div>
              </div>
            </Collapse>

            <Collapse title="Schedule" open={expanded.schedule} onToggle={() => setExpanded(p => ({ ...p, schedule: !p.schedule }))}>
              <label className={labelCls} style={labelStyle}>Daily Run Time</label>
              <input type="time" value={runTime} onChange={e => setRunTime(e.target.value)} style={{ ...inputBase, maxWidth: 180 }} />
            </Collapse>

            <button type="button" onClick={saveSettings} disabled={saving}
              className="mt-6 w-full sm:w-auto px-8 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200"
              style={{ backgroundColor: "var(--cyan)", color: "#000", opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>

          {/* Morning Briefing */}
          <div className="lg:col-span-2" style={{ ...card, padding: 24 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Morning Briefing</h2>
              <button type="button" onClick={refreshBrief} disabled={refreshingBriefing}
                className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-200"
                style={{ backgroundColor: "var(--bg-elevated)", color: "var(--cyan)", opacity: refreshingBriefing ? 0.5 : 1 }}>
                {refreshingBriefing ? "Loading..." : "Refresh"}
              </button>
            </div>
            {briefing ? (
              <div className="space-y-5">
                <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                  Good morning{user.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}!
                </p>
                <BriefingList label="HIGHLIGHTS" items={briefing.briefing.highlights} color="var(--cyan)" />
                <BriefingList label="ACTION ITEMS" items={briefing.briefing.action_items} color="var(--gold)" />
                <BriefingList label="NEW OPPORTUNITIES" items={briefing.briefing.new_opportunities} color="var(--green)" />
                {briefing.briefing.streak_status && (
                  <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                    <span className="font-semibold" style={{ color: "var(--gold)" }}>Streak {briefing.data?.streak?.streak_days ?? 0}d</span>
                    {" "}&mdash; {briefing.briefing.streak_status}
                  </div>
                )}
                {briefing.briefing.motivation && (
                  <p className="text-sm italic pt-2" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border-subtle)" }}>
                    &ldquo;{briefing.briefing.motivation}&rdquo;
                  </p>
                )}
              </div>
            ) : (
              <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading briefing...</div>
            )}
          </div>
        </div>

        {/* ── SECTION 3: HISTORY & QUEUE ───────────────── */}
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div className="flex border-b" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-surface)" }}>
            {(["history", "queued"] as BottomTab[]).map(tab => {
              const active = bottomTab === tab;
              return (
                <button key={tab} type="button" onClick={() => setBottomTab(tab)}
                  className="px-6 py-3 text-sm font-semibold transition-colors duration-200 relative"
                  style={{ color: active ? "var(--cyan)" : "var(--text-muted)" }}>
                  {tab === "history" ? "Run History" : `Queued (${queued.length})`}
                  {active && <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: "var(--cyan)" }} />}
                </button>
              );
            })}
          </div>

          <div className="p-6">
            {bottomTab === "history" && (
              runs.length === 0
                ? <p className="text-sm" style={{ color: "var(--text-muted)" }}>No autopilot runs yet. Enable autopilot and trigger a manual run, or wait for the scheduled run.</p>
                : <div className="overflow-x-auto">
                    <table className="w-full text-sm" style={{ color: "var(--text-secondary)" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          {["Date", "Found", "Qualified", "Submitted", "Failed"].map(h => (
                            <th key={h} className="text-left py-2 px-3 text-xs font-bold tracking-wider" style={{ color: "var(--text-muted)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map(r => (
                          <tr key={r.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                            <td className="py-2.5 px-3">{r.run_date}</td>
                            <td className="py-2.5 px-3">{r.jobs_found}</td>
                            <td className="py-2.5 px-3" style={{ color: "var(--cyan)" }}>{r.jobs_qualified}</td>
                            <td className="py-2.5 px-3" style={{ color: "var(--green)" }}>{r.applications_submitted}</td>
                            <td className="py-2.5 px-3" style={{ color: r.applications_failed > 0 ? "var(--red)" : undefined }}>{r.applications_failed}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
            )}

            {bottomTab === "queued" && (
              queued.length === 0
                ? <p className="text-sm" style={{ color: "var(--text-muted)" }}>No queued applications. Switch to Pre-Approve mode to queue jobs for review.</p>
                : <>
                    <div className="flex items-center gap-4 mb-4">
                      <label className="flex items-center gap-2 text-xs font-medium cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                        <input type="checkbox" checked={selected.size === queued.length && queued.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded accent-[var(--cyan)]" />
                        Select All ({queued.length})
                      </label>
                      {selected.size > 0 && (
                        <button type="button" onClick={approveSelected} disabled={approving}
                          className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
                          style={{ backgroundColor: "var(--green)", color: "#000", opacity: approving ? 0.5 : 1 }}>
                          {approving ? "Approving..." : `Approve Selected (${selected.size})`}
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {queued.map(q => {
                        const co = q.job_company || q.company || "Unknown";
                        const ttl = q.job_title || q.title || "Untitled";
                        const pct = q.match_score != null ? Math.round(q.match_score) : null;
                        const sel = selected.has(q.id);
                        return (
                          <div key={q.id} className="p-4 rounded-xl transition-all duration-200"
                            style={{ backgroundColor: "var(--bg-deep)", border: `2px solid ${sel ? "var(--cyan)" : "var(--border-subtle)"}` }}>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <input type="checkbox" checked={sel} onChange={() => toggleSelect(q.id)} className="mt-1 w-4 h-4 rounded accent-[var(--cyan)] shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{ttl}</div>
                                <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{co}</div>
                              </div>
                              {pct !== null && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                                  style={{ backgroundColor: pct >= 80 ? "var(--green)" : pct >= 60 ? "var(--gold)" : "var(--red)", color: "#000" }}>
                                  {pct}%
                                </span>
                              )}
                            </div>
                            <button type="button" onClick={() => approveSingle(q.id)}
                              className="w-full mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
                              style={{ backgroundColor: "var(--cyan)", color: "#000" }}>
                              Approve
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
            )}
          </div>
        </div>
      </main>
      <MobileNav />
    </div>
  );
}

/* ── Collapsible Section ──────────────────────────────── */
function Collapse({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors duration-200" style={{ backgroundColor: "var(--bg-elevated)" }}>
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</span>
        <svg className="w-4 h-4 transition-transform duration-200" style={{ color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "rotate(0deg)" }} viewBox="0 0 16 16" fill="none">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className="px-4 py-4" style={{ backgroundColor: "var(--bg-surface)" }}>{children}</div>}
    </div>
  );
}

/* ── Briefing List ────────────────────────────────────── */
function BriefingList({ label, items, color }: { label: string; items?: string[]; color: string }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="text-xs font-bold tracking-wider mb-2" style={{ color }}>{label}</h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm flex gap-2" style={{ color: "var(--text-secondary)" }}>
            <span style={{ color }}>-</span> {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
