"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Button } from "@/components/ui/button";

interface Question { question: string; category: string; difficulty?: string }
interface PrepPlan { day: number; focus: string; tasks: string[] }
interface PrepPackage {
  id: number; company: string; role: string; interview_date: string;
  rounds: number; difficulty: string; style: string; questions: Question[];
  prep_plan: PrepPlan[]; behavioral_stories: string[]; created_at?: string;
}
interface PrepListItem { id: number; company: string; role: string; interview_date: string; created_at?: string }
interface PracticeFeedback {
  scores: { relevance: number; depth: number; structure: number; communication: number };
  strengths: string[]; improvements: string[]; model_answer: string; verdict: string;
}
interface PracticeEntry { question: string; user_answer: string; feedback: PracticeFeedback }
interface CommunityReport {
  id?: number; company: string; role: string; difficulty: number; rounds: number;
  got_offer: boolean; questions: string; notes: string; tips: string; anonymous: boolean; created_at?: string;
}
interface CommunityData { avg_difficulty: number; offer_rate: number; common_questions: string[]; reports: CommunityReport[] }
type TabId = "prepare" | "practice" | "community";

const CAT_ORDER = ["behavioral", "technical", "system_design", "culture"];
const catLabel = (c: string) => c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
const dCol = (d: number) => (d >= 4 ? { bg: "var(--red-15)", fg: "var(--red)" } : d >= 3 ? { bg: "var(--gold-15)", fg: "var(--gold)" } : { bg: "var(--green-15)", fg: "var(--green)" });
const vCol = (v: string) => (v === "would_advance" ? { bg: "var(--green-15)", fg: "var(--green)" } : v === "on_fence" ? { bg: "var(--gold-15)", fg: "var(--gold)" } : { bg: "var(--red-15)", fg: "var(--red)" });
const card = { background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" };
const inp = { background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" };

export default function InterviewOraclePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("prepare");
  const [company, setCompany] = useState(""); const [role, setRole] = useState("");
  const [interviewDate, setInterviewDate] = useState(""); const [jobId, setJobId] = useState("");
  const [prep, setPrep] = useState<PrepPackage | null>(null);
  const [preps, setPreps] = useState<PrepListItem[]>([]); const [loadingPrep, setLoadingPrep] = useState(false);
  const [selectedPrepId, setSelectedPrepId] = useState<number | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(""); const [userAnswer, setUserAnswer] = useState("");
  const [feedback, setFeedback] = useState<PracticeFeedback | null>(null);
  const [practiceHistory, setPracticeHistory] = useState<PracticeEntry[]>([]);
  const [loadingPractice, setLoadingPractice] = useState(false); const [showModel, setShowModel] = useState(false);
  const [communitySearch, setCommunitySearch] = useState("");
  const [communityData, setCommunityData] = useState<CommunityData | null>(null);
  const [loadingCommunity, setLoadingCommunity] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [rf, setRf] = useState({ company: "", role: "", difficulty: 3, rounds: 3, got_offer: false, questions: "", notes: "", tips: "", anonymous: true });
  const [submitting, setSubmitting] = useState(false); const [error, setError] = useState("");

  useEffect(() => { if (!authLoading && !user) router.replace("/login"); }, [user, authLoading, router]);
  useEffect(() => { api.get<PrepListItem[]>("/career/interview/preps").then(setPreps).catch(() => {}); }, []);

  const generatePrep = useCallback(async () => {
    if (!company.trim() || !role.trim()) return; setLoadingPrep(true); setError("");
    try {
      const res = await api.post<PrepPackage>("/career/interview/prep", { company, role, interview_date: interviewDate || undefined, job_id: jobId || undefined });
      setPrep(res); setPreps((p) => [{ id: res.id, company: res.company, role: res.role, interview_date: res.interview_date, created_at: res.created_at }, ...p]);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to generate prep"); } finally { setLoadingPrep(false); }
  }, [company, role, interviewDate, jobId]);

  const loadPrep = useCallback(async (id: number) => {
    try { setPrep(await api.get<PrepPackage>(`/career/interview/prep/${id}`)); } catch { /* keep */ }
  }, []);

  const submitAnswer = useCallback(async () => {
    if (!selectedPrepId || !currentQuestion.trim() || !userAnswer.trim()) return;
    setLoadingPractice(true); setError(""); setShowModel(false);
    try {
      const res = await api.post<PracticeFeedback>(`/career/interview/practice/${selectedPrepId}`, { question: currentQuestion, user_answer: userAnswer });
      setFeedback(res); setPracticeHistory((p) => [{ question: currentQuestion, user_answer: userAnswer, feedback: res }, ...p]);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Submission failed"); } finally { setLoadingPractice(false); }
  }, [selectedPrepId, currentQuestion, userAnswer]);

  const searchCommunity = useCallback(async () => {
    if (!communitySearch.trim()) return; setLoadingCommunity(true); setError("");
    try { setCommunityData(await api.get<CommunityData>(`/career/interview/reports/${encodeURIComponent(communitySearch)}`)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Search failed"); } finally { setLoadingCommunity(false); }
  }, [communitySearch]);

  const submitReport = useCallback(async () => {
    if (!rf.company.trim() || !rf.role.trim()) return; setSubmitting(true); setError("");
    try { await api.post("/career/interview/report", rf); setShowReportForm(false); setRf({ company: "", role: "", difficulty: 3, rounds: 3, got_offer: false, questions: "", notes: "", tips: "", anonymous: true }); if (communitySearch.trim()) searchCommunity(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Submit failed"); } finally { setSubmitting(false); }
  }, [rf, communitySearch, searchCommunity]);

  if (authLoading || !user) return null;
  const tabs: { id: TabId; label: string }[] = [{ id: "prepare", label: "Prepare" }, { id: "practice", label: "Practice" }, { id: "community", label: "Community Reports" }];
  const grouped: Record<string, Question[]> = {};
  if (prep) for (const q of prep.questions) (grouped[q.category] ??= []).push(q);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-deep)" }}>
      <TopNav />
      <main className="max-w-6xl mx-auto px-4 pt-20 pb-28 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Interview Oracle</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>AI-powered interview prep, practice, and community intelligence</p>
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--bg-surface)" }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setError(""); }}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: tab === t.id ? "var(--cyan-15)" : "transparent", color: tab === t.id ? "var(--cyan)" : "var(--text-muted)" }}>{t.label}</button>
          ))}
        </div>
        {error && <div className="p-3 rounded-lg text-sm" style={{ background: "var(--red-15)", color: "var(--red)" }}>{error}</div>}

        {/* ── Prepare ── */}
        {tab === "prepare" && (
          <div className="space-y-6">
            <div className="rounded-xl p-5 space-y-4" style={card}>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Company <span style={{ color: "var(--red)" }}>*</span></label>
                  <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Google" className="w-full px-3 py-2 rounded-lg text-sm" style={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Role <span style={{ color: "var(--red)" }}>*</span></label>
                  <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Senior SWE" className="w-full px-3 py-2 rounded-lg text-sm" style={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Interview Date</label>
                  <input type="date" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Job ID <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>(optional)</span></label>
                  <input value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="From tracked jobs" className="w-full px-3 py-2 rounded-lg text-sm" style={inp} />
                </div>
              </div>
              <Button onClick={generatePrep} disabled={loadingPrep || !company.trim() || !role.trim()}>{loadingPrep ? "Generating..." : "Generate Prep Package"}</Button>
            </div>
            {prep && (
              <div className="space-y-5">
                <div className="rounded-xl p-5" style={card}>
                  <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Interview Profile</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {[{ l: "Rounds", v: String(prep.rounds), c: "var(--text-primary)" }, { l: "Difficulty", v: prep.difficulty, c: dCol(parseInt(prep.difficulty) || 3).fg }, { l: "Style", v: prep.style, c: "var(--cyan)" }].map((x) => (
                      <div key={x.l} className="text-center p-3 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{x.l}</p>
                        <p className="text-lg font-bold capitalize" style={{ color: x.c }}>{x.v}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl p-5" style={card}>
                  <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Question Bank</h3>
                  {CAT_ORDER.filter((c) => grouped[c]).map((cat) => (
                    <div key={cat} className="mb-4 last:mb-0">
                      <p className="text-xs font-semibold mb-2 px-2 py-1 rounded inline-block" style={{ background: "var(--cyan-15)", color: "var(--cyan)" }}>{catLabel(cat)}</p>
                      {grouped[cat].map((q, i) => (
                        <p key={i} className="text-sm py-1" style={{ color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                          <span className="font-mono text-xs mr-2" style={{ color: "var(--text-muted)" }}>{i + 1}.</span>{q.question}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
                {prep.prep_plan.length > 0 && (
                  <div className="rounded-xl p-5" style={card}>
                    <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Prep Plan</h3>
                    {prep.prep_plan.map((d) => (
                      <div key={d.day} className="flex gap-3 mb-3 last:mb-0">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-xs font-bold" style={{ background: "var(--cyan-15)", color: "var(--cyan)" }}>D{d.day}</div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{d.focus}</p>
                          {d.tasks.map((t, i) => <p key={i} className="text-xs" style={{ color: "var(--text-muted)" }}>- {t}</p>)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {prep.behavioral_stories.length > 0 && (
                  <div className="rounded-xl p-5" style={card}>
                    <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Behavioral Stories from CV</h3>
                    {prep.behavioral_stories.map((s, i) => <div key={i} className="text-sm p-3 rounded-lg mb-2 last:mb-0" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>{s}</div>)}
                  </div>
                )}
              </div>
            )}
            {preps.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Previous Preps</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  {preps.map((p) => (
                    <button key={p.id} onClick={() => loadPrep(p.id)} className="text-left p-4 rounded-xl" style={card}>
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{p.role}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{p.company}</p>
                      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{p.interview_date}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Practice ── */}
        {tab === "practice" && (
          <div className="space-y-6">
            <div className="rounded-xl p-5 space-y-4" style={card}>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Select Prep</label>
                <select value={selectedPrepId ?? ""} onChange={(e) => { const id = Number(e.target.value); setSelectedPrepId(id || null); if (id) loadPrep(id); }}
                  className="w-full px-3 py-2 rounded-lg text-sm" style={inp}>
                  <option value="">-- Choose a prep --</option>
                  {preps.map((p) => <option key={p.id} value={p.id}>{p.company} - {p.role}</option>)}
                </select>
              </div>
              {selectedPrepId && prep && (<>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Question</label>
                  <div className="p-3 rounded-lg text-sm" style={{ ...inp }}>
                    {currentQuestion || (
                      <div className="space-y-1">
                        <p style={{ color: "var(--text-muted)" }}>Pick a question:</p>
                        {prep.questions.slice(0, 5).map((q, i) => (
                          <button key={i} onClick={() => setCurrentQuestion(q.question)} className="block text-left text-xs py-1 w-full" style={{ color: "var(--cyan)" }}>{q.question}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Your Answer</label>
                  <textarea value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)} rows={5} placeholder="Type your answer..."
                    className="w-full px-3 py-2 rounded-lg text-sm resize-none" style={inp} />
                </div>
                <Button onClick={submitAnswer} disabled={loadingPractice || !currentQuestion.trim() || !userAnswer.trim()}>{loadingPractice ? "Evaluating..." : "Submit Answer"}</Button>
              </>)}
            </div>
            {feedback && (
              <div className="rounded-xl p-5 space-y-4" style={card}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Feedback</h3>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full capitalize" style={{ background: vCol(feedback.verdict).bg, color: vCol(feedback.verdict).fg }}>{feedback.verdict.replace(/_/g, " ")}</span>
                </div>
                <div className="space-y-2.5">
                  {Object.entries(feedback.scores).map(([dim, sc]) => (
                    <div key={dim}>
                      <div className="flex justify-between mb-1"><span className="text-xs capitalize" style={{ color: "var(--text-secondary)" }}>{dim}</span><span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{sc}/10</span></div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                        <div className="h-full rounded-full" style={{ width: `${sc * 10}%`, background: sc >= 7 ? "var(--green)" : sc >= 4 ? "var(--gold)" : "var(--red)", transition: "width 0.5s" }} />
                      </div>
                    </div>
                  ))}
                </div>
                {feedback.strengths.length > 0 && <div><p className="text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--green)" }}>Strengths</p>{feedback.strengths.map((s, i) => <p key={i} className="text-xs" style={{ color: "var(--text-secondary)" }}>+ {s}</p>)}</div>}
                {feedback.improvements.length > 0 && <div><p className="text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--gold)" }}>Improvements</p>{feedback.improvements.map((s, i) => <p key={i} className="text-xs" style={{ color: "var(--text-secondary)" }}>- {s}</p>)}</div>}
                <div>
                  <button onClick={() => setShowModel(!showModel)} className="text-xs font-medium" style={{ color: "var(--cyan)" }}>{showModel ? "Hide" : "Show"} Model Answer</button>
                  {showModel && <div className="mt-2 p-3 rounded-lg text-xs leading-relaxed" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>{feedback.model_answer}</div>}
                </div>
              </div>
            )}
            {practiceHistory.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Practice History</h3>
                {practiceHistory.map((h, i) => (
                  <div key={i} className="p-3 rounded-lg flex items-center justify-between mb-2" style={card}>
                    <p className="text-xs truncate flex-1 mr-3" style={{ color: "var(--text-secondary)" }}>{h.question}</p>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize" style={{ background: vCol(h.feedback.verdict).bg, color: vCol(h.feedback.verdict).fg }}>{h.feedback.verdict.replace(/_/g, " ")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Community ── */}
        {tab === "community" && (
          <div className="space-y-6">
            <div className="flex gap-2">
              <input value={communitySearch} onChange={(e) => setCommunitySearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchCommunity()}
                placeholder="Search company..." className="flex-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }} />
              <Button onClick={searchCommunity} disabled={loadingCommunity || !communitySearch.trim()}>{loadingCommunity ? "Searching..." : "Search"}</Button>
            </div>
            {communityData && (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl text-center" style={card}><p className="text-xs" style={{ color: "var(--text-muted)" }}>Avg Difficulty</p><p className="text-xl font-bold font-mono" style={{ color: dCol(communityData.avg_difficulty).fg }}>{communityData.avg_difficulty.toFixed(1)}/5</p></div>
                  <div className="p-3 rounded-xl text-center" style={card}><p className="text-xs" style={{ color: "var(--text-muted)" }}>Offer Rate</p><p className="text-xl font-bold font-mono" style={{ color: communityData.offer_rate >= 50 ? "var(--green)" : "var(--gold)" }}>{communityData.offer_rate}%</p></div>
                  <div className="p-3 rounded-xl text-center" style={card}><p className="text-xs" style={{ color: "var(--text-muted)" }}>Reports</p><p className="text-xl font-bold font-mono" style={{ color: "var(--text-primary)" }}>{communityData.reports.length}</p></div>
                </div>
                {communityData.common_questions.length > 0 && (
                  <div className="rounded-xl p-5" style={card}>
                    <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Common Questions</h3>
                    {communityData.common_questions.map((q, i) => <p key={i} className="text-sm py-1" style={{ color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}><span className="font-mono text-xs mr-2" style={{ color: "var(--text-muted)" }}>{i + 1}.</span>{q}</p>)}
                  </div>
                )}
                {communityData.reports.map((r, i) => (
                  <div key={r.id ?? i} className="rounded-xl p-4" style={card}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{r.role}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: dCol(r.difficulty).bg, color: dCol(r.difficulty).fg }}>{r.difficulty}/5</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{r.rounds} rounds</span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: r.got_offer ? "var(--green-15)" : "var(--red-15)", color: r.got_offer ? "var(--green)" : "var(--red)" }}>{r.got_offer ? "Offer" : "No Offer"}</span>
                      </div>
                    </div>
                    {r.tips && <p className="text-xs" style={{ color: "var(--text-muted)" }}>Tip: {r.tips}</p>}
                  </div>
                ))}
              </div>
            )}
            {/* Report Form */}
            <div className="rounded-xl" style={card}>
              <button onClick={() => setShowReportForm(!showReportForm)} className="w-full text-left px-5 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Submit Your Report</span>
                <span className="text-xs" style={{ color: "var(--cyan)" }}>{showReportForm ? "Collapse" : "Expand"}</span>
              </button>
              {showReportForm && (
                <div className="px-5 pb-5 space-y-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <div className="grid sm:grid-cols-2 gap-4 pt-4">
                    <div><label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Company *</label><input value={rf.company} onChange={(e) => setRf({ ...rf, company: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={inp} /></div>
                    <div><label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Role *</label><input value={rf.role} onChange={(e) => setRf({ ...rf, role: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={inp} /></div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Difficulty: <span className="font-mono" style={{ color: "var(--cyan)" }}>{rf.difficulty}/5</span></label>
                      <input type="range" min={1} max={5} value={rf.difficulty} onChange={(e) => setRf({ ...rf, difficulty: Number(e.target.value) })} className="w-full accent-[var(--cyan)]" />
                    </div>
                    <div><label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Rounds</label><input type="number" min={1} max={10} value={rf.rounds} onChange={(e) => setRf({ ...rf, rounds: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg text-sm" style={inp} /></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Got Offer?</label>
                    <button onClick={() => setRf({ ...rf, got_offer: !rf.got_offer })} className="w-10 h-5 rounded-full relative" style={{ background: rf.got_offer ? "var(--green)" : "var(--border-subtle)" }}>
                      <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: rf.got_offer ? 21 : 2 }} />
                    </button>
                    <span className="text-xs" style={{ color: rf.got_offer ? "var(--green)" : "var(--text-muted)" }}>{rf.got_offer ? "Yes" : "No"}</span>
                  </div>
                  <div><label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Questions</label><textarea value={rf.questions} onChange={(e) => setRf({ ...rf, questions: e.target.value })} rows={3} placeholder="One per line..." className="w-full px-3 py-2 rounded-lg text-sm resize-none" style={inp} /></div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div><label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Notes</label><textarea value={rf.notes} onChange={(e) => setRf({ ...rf, notes: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg text-sm resize-none" style={inp} /></div>
                    <div><label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Tips</label><textarea value={rf.tips} onChange={(e) => setRf({ ...rf, tips: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg text-sm resize-none" style={inp} /></div>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={rf.anonymous} onChange={(e) => setRf({ ...rf, anonymous: e.target.checked })} className="accent-[var(--cyan)]" /><span className="text-xs" style={{ color: "var(--text-secondary)" }}>Post anonymously</span></label>
                    <Button onClick={submitReport} disabled={submitting || !rf.company.trim() || !rf.role.trim()}>{submitting ? "Submitting..." : "Submit Report"}</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      <MobileNav />
    </div>
  );
}
