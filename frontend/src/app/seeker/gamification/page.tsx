"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";

/* -- Types --------------------------------------------------------- */
interface GamificationProfile {
  level: number; level_title: string;
  xp_current: number; xp_next_level: number; xp_total: number;
  streak_days: number; streak_best: number; streak_shields: number;
  momentum_score: number;
  stats: { applications: number; responses: number; offers: number };
  achievements?: Achievement[];
}
interface Quest {
  id: string; title: string; description: string;
  type: "daily" | "weekly" | "achievement" | "legendary";
  progress: number; target: number; xp_reward: number; completed: boolean;
}
interface XpEvent { id: string; action: string; xp: number; created_at: string }
interface XpDay { date: string; xp: number }
interface XpHistoryResponse { daily: XpDay[]; events: XpEvent[] }
interface Achievement {
  id: string; badge_icon: string; badge_name: string;
  description: string; unlocked: boolean; unlocked_at: string | null;
}
interface LeaderboardEntry {
  rank: number; user_id: number; full_name: string; level: number;
  xp_total: number; streak_days: number; applications: number;
  is_current_user: boolean;
}

/* -- Helpers ------------------------------------------------------- */
const QUEST_COLORS: Record<Quest["type"], string> = {
  daily: "var(--cyan)", weekly: "var(--gold)",
  achievement: "var(--green)", legendary: "#c084fc",
};
const RANK_COLORS: Record<string, string> = {
  gold: "#fbbf24", silver: "#94a3b8", bronze: "#d97706",
};
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const rankMedal = (r: number) =>
  r === 1 ? "gold" : r === 2 ? "silver" : r === 3 ? "bronze" : "";

function Card({ children, className = "", style = {} }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties;
}) {
  return (
    <div className={`rounded-xl p-5 ${className}`} style={{
      backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
      boxShadow: "var(--shadow-card)", ...style,
    }}>{children}</div>
  );
}

/* -- Page ---------------------------------------------------------- */
export default function GamificationPage() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<GamificationProfile | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [xpHistory, setXpHistory] = useState<XpHistoryResponse | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [prof, qsts, lb, , xp] = await Promise.all([
        api.get<GamificationProfile>("/gamification/profile"),
        api.get<Quest[]>("/gamification/quests"),
        api.get<LeaderboardEntry[]>("/gamification/leaderboard?limit=20"),
        api.post("/gamification/streak"),
        api.get<XpHistoryResponse>("/gamification/xp/history?days=7"),
      ]);
      setProfile(prof);
      setQuests(qsts);
      setLeaderboard(lb);
      setXpHistory(xp);
      if (prof.achievements) setAchievements(prof.achievements);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load gamification data");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (!authLoading && user) loadData(); }, [authLoading, user, loadData]);

  const xpPct = profile && profile.xp_next_level > 0
    ? Math.min(100, Math.round((profile.xp_current / profile.xp_next_level) * 100)) : 0;
  const xpDays = xpHistory?.daily ?? [];
  const xpMax = Math.max(...xpDays.map((d) => d.xp), 1);
  const mom = profile?.momentum_score ?? 0;
  const momColor = mom >= 70 ? "var(--green)" : mom >= 40 ? "var(--gold)" : "var(--red)";

  /* Loading state */
  if (authLoading || loading) {
    return (<>
      <TopNav />
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-deep)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--cyan)", borderTopColor: "transparent" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading your quest log...</p>
        </div>
      </main>
      <MobileNav />
    </>);
  }

  /* Error state */
  if (error) {
    return (<>
      <TopNav />
      <main className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "var(--bg-deep)" }}>
        <Card className="max-w-md w-full text-center">
          <p className="text-sm mb-3" style={{ color: "var(--red)" }}>{error}</p>
          <button onClick={loadData} className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ backgroundColor: "var(--cyan)", color: "#000" }}>Retry</button>
        </Card>
      </main>
      <MobileNav />
    </>);
  }

  return (<>
    <TopNav />
    <main className="min-h-screen pb-24 md:pb-12" style={{ backgroundColor: "var(--bg-deep)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">

        {/* ==================== PLAYER CARD ==================== */}
        <Card className="relative overflow-hidden" style={{
          background: "linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-elevated) 100%)",
        }}>
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full opacity-10 pointer-events-none"
            style={{ background: "radial-gradient(circle, var(--cyan) 0%, transparent 70%)" }} />
          <div className="flex flex-col lg:flex-row gap-6 relative z-10">
            {/* Level badge */}
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-full flex items-center justify-center shrink-0" style={{
                background: "conic-gradient(var(--cyan) 0%, var(--green) 50%, var(--cyan) 100%)",
                boxShadow: "0 0 24px rgba(0,255,255,0.2)",
              }}>
                <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "var(--bg-surface)" }}>
                  <span className="text-2xl font-bold font-mono" style={{ color: "var(--cyan)" }}>
                    {profile?.level ?? 0}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1"
                  style={{ color: "var(--cyan)" }}>{profile?.level_title ?? "Recruit"}</p>
                {/* XP bar */}
                <div className="w-56 sm:w-72">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span style={{ color: "var(--text-secondary)" }}>
                      {profile?.xp_current?.toLocaleString() ?? 0} / {profile?.xp_next_level?.toLocaleString() ?? 0} XP
                    </span>
                    <span className="font-mono font-bold" style={{ color: "var(--cyan)" }}>{xpPct}%</span>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-deep)" }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{
                      width: `${xpPct}%`,
                      background: "linear-gradient(90deg, var(--cyan), var(--green))",
                      boxShadow: "0 0 8px var(--cyan)",
                    }} />
                  </div>
                </div>
                <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                  Total XP: <span className="font-mono font-semibold" style={{ color: "var(--gold)" }}>
                    {profile?.xp_total?.toLocaleString() ?? 0}</span>
                </p>
              </div>
            </div>

            {/* Streak / momentum / stats */}
            <div className="flex flex-wrap gap-4 lg:ml-auto items-center">
              {/* Streak flame */}
              <div className="flex flex-col items-center px-4 py-3 rounded-lg" style={{ backgroundColor: "var(--bg-deep)" }}>
                <span className="text-2xl leading-none" role="img" aria-label="streak">
                  {(profile?.streak_days ?? 0) > 0 ? "\uD83D\uDD25" : "\u2744\uFE0F"}
                </span>
                <span className="text-xl font-bold font-mono mt-1" style={{ color: "var(--gold)" }}>
                  {profile?.streak_days ?? 0}</span>
                <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Day Streak</span>
                <span className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Best: {profile?.streak_best ?? 0}</span>
              </div>
              {/* Shields */}
              <div className="flex flex-col items-center px-4 py-3 rounded-lg" style={{ backgroundColor: "var(--bg-deep)" }}>
                <span className="text-2xl leading-none" role="img" aria-label="shields">{"\uD83D\uDEE1\uFE0F"}</span>
                <span className="text-xl font-bold font-mono mt-1" style={{ color: "var(--cyan)" }}>
                  {profile?.streak_shields ?? 0}</span>
                <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Shields</span>
              </div>
              {/* Momentum gauge */}
              <div className="flex flex-col items-center px-4 py-3 rounded-lg" style={{ backgroundColor: "var(--bg-deep)" }}>
                <div className="relative w-14 h-14">
                  <svg viewBox="0 0 56 56" className="w-14 h-14">
                    <circle cx="28" cy="28" r="24" fill="none" stroke="var(--bg-elevated)" strokeWidth="4" />
                    <circle cx="28" cy="28" r="24" fill="none" stroke={momColor} strokeWidth="4"
                      strokeLinecap="round" strokeDasharray={`${(mom / 100) * 150.8} 150.8`}
                      transform="rotate(-90 28 28)" style={{ transition: "stroke-dasharray 0.8s ease" }} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold font-mono"
                    style={{ color: momColor }}>{mom}</span>
                </div>
                <span className="text-[10px] uppercase tracking-wider mt-1" style={{ color: "var(--text-muted)" }}>Momentum</span>
              </div>
              {/* Quick stats */}
              <div className="flex gap-3">
                {([
                  { label: "Apps", value: profile?.stats.applications ?? 0, color: "var(--cyan)" },
                  { label: "Responses", value: profile?.stats.responses ?? 0, color: "var(--green)" },
                  { label: "Offers", value: profile?.stats.offers ?? 0, color: "var(--gold)" },
                ] as const).map((s) => (
                  <div key={s.label} className="flex flex-col items-center px-3 py-3 rounded-lg"
                    style={{ backgroundColor: "var(--bg-deep)" }}>
                    <span className="text-lg font-bold font-mono" style={{ color: s.color }}>{s.value}</span>
                    <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* ==================== ACTIVE QUESTS ==================== */}
        <section>
          <h2 className="text-lg font-semibold mb-4 tracking-tight" style={{ color: "var(--text-primary)" }}>
            Active Quests</h2>
          {quests.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No active quests right now. Check back soon!</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {quests.map((q) => {
                const pct = q.target > 0 ? Math.min(100, Math.round((q.progress / q.target) * 100)) : 0;
                const color = QUEST_COLORS[q.type];
                return (
                  <Card key={q.id} style={{ borderLeft: `3px solid ${color}`, opacity: q.completed ? 0.7 : 1 }}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>{q.type}</span>
                        <h3 className="text-sm font-semibold mt-0.5 leading-tight" style={{ color: "var(--text-primary)" }}>
                          {q.completed && <span className="inline-block mr-1.5" style={{ color: "var(--green)" }}>{"\u2713"}</span>}
                          {q.title}
                        </h3>
                      </div>
                      <span className="shrink-0 text-[11px] font-bold font-mono px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${color}20`, color }}>+{q.xp_reward} XP</span>
                    </div>
                    <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--text-muted)" }}>{q.description}</p>
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span style={{ color: "var(--text-secondary)" }}>{q.progress} / {q.target}</span>
                        <span className="font-mono" style={{ color }}>{pct}%</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-deep)" }}>
                        <div className="h-full rounded-full transition-all duration-500" style={{
                          width: `${pct}%`, backgroundColor: color,
                          boxShadow: q.completed ? "none" : `0 0 6px ${color}`,
                        }} />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* ==================== XP HISTORY ==================== */}
        <section>
          <h2 className="text-lg font-semibold mb-4 tracking-tight" style={{ color: "var(--text-primary)" }}>
            XP History (Last 7 Days)</h2>
          <Card>
            <div className="flex items-end gap-2 h-40 mb-6">
              {xpDays.map((d) => {
                const hPct = xpMax > 0 ? Math.max(4, (d.xp / xpMax) * 100) : 4;
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-mono font-bold" style={{ color: "var(--cyan)" }}>
                      {d.xp > 0 ? `+${d.xp}` : "0"}</span>
                    <div className="w-full rounded-t-md transition-all duration-500" style={{
                      height: `${hPct}%`, minHeight: "4px",
                      background: d.xp > 0 ? "linear-gradient(180deg, var(--cyan), var(--green))" : "var(--bg-elevated)",
                      boxShadow: d.xp > 0 ? "0 0 8px rgba(0,255,255,0.15)" : "none",
                    }} />
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{fmtDate(d.date)}</span>
                  </div>
                );
              })}
              {xpDays.length === 0 && (
                <p className="text-sm w-full text-center py-8" style={{ color: "var(--text-muted)" }}>
                  No XP data yet. Start completing quests!</p>
              )}
            </div>
            {/* Recent events */}
            {xpHistory?.events && xpHistory.events.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-widest mb-3"
                  style={{ color: "var(--text-muted)" }}>Recent Activity</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {xpHistory.events.slice(0, 15).map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg"
                      style={{ backgroundColor: "var(--bg-deep)" }}>
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{ev.action}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold font-mono"
                          style={{ color: ev.xp > 0 ? "var(--green)" : "var(--red)" }}>
                          {ev.xp > 0 ? `+${ev.xp}` : ev.xp} XP</span>
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{fmtDate(ev.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </section>

        {/* ==================== ACHIEVEMENTS ==================== */}
        {achievements.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-4 tracking-tight" style={{ color: "var(--text-primary)" }}>
              Achievements</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {achievements.map((a) => (
                <div key={a.id}
                  className="flex flex-col items-center text-center p-4 rounded-xl transition-all duration-200"
                  style={{
                    backgroundColor: a.unlocked ? "var(--bg-surface)" : "var(--bg-deep)",
                    border: `1px solid ${a.unlocked ? "var(--border-subtle)" : "transparent"}`,
                    opacity: a.unlocked ? 1 : 0.4, filter: a.unlocked ? "none" : "grayscale(100%)",
                  }}
                  title={a.unlocked
                    ? `${a.description}\nUnlocked: ${a.unlocked_at ? fmtDate(a.unlocked_at) : ""}`
                    : a.description}>
                  <span className="text-3xl mb-2">{a.badge_icon}</span>
                  <span className="text-[11px] font-semibold leading-tight"
                    style={{ color: a.unlocked ? "var(--text-primary)" : "var(--text-muted)" }}>
                    {a.badge_name}</span>
                  {a.unlocked && a.unlocked_at && (
                    <span className="text-[9px] mt-1" style={{ color: "var(--text-muted)" }}>{fmtDate(a.unlocked_at)}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ==================== LEADERBOARD ==================== */}
        <section>
          <h2 className="text-lg font-semibold mb-4 tracking-tight" style={{ color: "var(--text-primary)" }}>
            Leaderboard</h2>
          <Card className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest"
                  style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}>
                  <th className="pb-3 pr-3 w-14">Rank</th>
                  <th className="pb-3 pr-3">Player</th>
                  <th className="pb-3 pr-3 text-center w-16">Level</th>
                  <th className="pb-3 pr-3 text-right w-24">XP</th>
                  <th className="pb-3 pr-3 text-center w-16">Streak</th>
                  <th className="pb-3 text-right w-20">Apps</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((e) => {
                  const medal = rankMedal(e.rank);
                  const mc = medal ? RANK_COLORS[medal] : undefined;
                  const isMe = e.is_current_user;
                  return (
                    <tr key={e.user_id} className="transition-colors duration-150" style={{
                      backgroundColor: isMe ? "rgba(0,255,255,0.06)" : "transparent",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}>
                      <td className="py-3 pr-3">
                        {medal ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold font-mono"
                            style={{ backgroundColor: `${mc}18`, color: mc, border: `1px solid ${mc}40` }}>
                            {e.rank}</span>
                        ) : (
                          <span className="pl-1.5 font-bold font-mono text-sm"
                            style={{ color: "var(--text-secondary)" }}>{e.rank}</span>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <span className="text-sm font-medium" style={{ color: isMe ? "var(--cyan)" : "var(--text-primary)" }}>
                          {e.full_name}
                          {isMe && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: "rgba(0,255,255,0.12)", color: "var(--cyan)" }}>YOU</span>}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-center">
                        <span className="text-xs font-bold font-mono px-2 py-1 rounded-full"
                          style={{ backgroundColor: "var(--bg-deep)", color: "var(--green)" }}>{e.level}</span>
                      </td>
                      <td className="py-3 pr-3 text-right text-sm font-mono" style={{ color: "var(--gold)" }}>
                        {e.xp_total.toLocaleString()}</td>
                      <td className="py-3 pr-3 text-center">
                        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          {e.streak_days > 0 ? `${e.streak_days}d` : "-"}</span>
                      </td>
                      <td className="py-3 text-right text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
                        {e.applications}</td>
                    </tr>
                  );
                })}
                {leaderboard.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                    Leaderboard is empty. Be the first to rank up!</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </section>

      </div>
    </main>
    <MobileNav />
  </>);
}
