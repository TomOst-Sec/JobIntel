"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";

interface Candidate {
  candidate_id: string;
  full_name: string;
  headline: string | null;
  skills: string[];
  experience_years: number | null;
  current_company: string | null;
  current_title: string | null;
  location: string | null;
  country: string | null;
  is_remote_ok: boolean;
  salary_min: number | null;
  salary_max: number | null;
  availability: string;
  summary: string | null;
  email: string | null;
}

interface CandidateMatch {
  candidate: Candidate;
  match_score: number;
  score_breakdown: Record<string, number>;
  explanation: string | null;
}

interface SearchResponse {
  search_id: string;
  candidates: CandidateMatch[];
  clarifying_questions: string[] | null;
  parsed_brief: Record<string, unknown> | null;
}

interface ChatMessage {
  role: string;
  content: string;
  created_at: string | null;
}

interface SearchListItem {
  search_id: string;
  brief: string;
  status: string;
  created_at: string;
}

const SCORE_DIMENSIONS = [
  { key: "skills", label: "Skills", color: "var(--cyan)" },
  { key: "experience", label: "Experience", color: "var(--green)" },
  { key: "availability", label: "Availability", color: "var(--gold)" },
  { key: "compensation", label: "Compensation", color: "var(--purple)" },
  { key: "location", label: "Location", color: "#ff8800" },
  { key: "quality", label: "Quality", color: "var(--red)" },
];

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? "var(--green)" : score >= 60 ? "var(--gold)" : "var(--red)";
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
        <circle cx="32" cy="32" r="28" fill="none" stroke="var(--border-subtle)" strokeWidth="4" />
        <circle
          cx="32" cy="32" r="28" fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-sm font-bold"
        style={{ color, fontFeatureSettings: "'tnum'" }}
      >
        {Math.round(score)}
      </span>
    </div>
  );
}

function CandidateCard({
  match, parsedBrief, onShortlist, onGenerateOutreach, onAddPipeline,
}: {
  match: CandidateMatch;
  parsedBrief: Record<string, unknown> | null;
  onShortlist: (id: string) => void;
  onGenerateOutreach: (id: string) => void;
  onAddPipeline: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const c = match.candidate;
  const mustHave = (parsedBrief?.must_have_skills as string[]) || [];
  const niceToHave = (parsedBrief?.nice_to_have_skills as string[]) || [];
  const matchedSkills = new Set([...mustHave, ...niceToHave].map((s) => s.toLowerCase()));

  return (
    <div
      className="card p-4 rounded-xl transition-all duration-200"
      style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="flex gap-4">
        <ScoreGauge score={match.match_score} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                {c.full_name}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {c.current_title} at {c.current_company}
              </p>
            </div>
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0"
              style={{
                backgroundColor: c.availability === "active" ? "var(--green-15)" : c.availability === "passive" ? "var(--gold-15)" : "var(--red-15)",
                color: c.availability === "active" ? "var(--green)" : c.availability === "passive" ? "var(--gold)" : "var(--red)",
              }}
            >
              {c.availability}
            </span>
          </div>

          {c.headline && (
            <p className="text-xs mt-1 truncate" style={{ color: "var(--text-muted)" }}>
              {c.headline}
            </p>
          )}

          {/* Skills pills */}
          <div className="flex flex-wrap gap-1 mt-2">
            {c.skills.slice(0, 8).map((skill) => (
              <span
                key={skill}
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: matchedSkills.has(skill.toLowerCase()) ? "var(--cyan-15)" : "var(--bg-elevated)",
                  color: matchedSkills.has(skill.toLowerCase()) ? "var(--cyan)" : "var(--text-muted)",
                  border: matchedSkills.has(skill.toLowerCase()) ? "1px solid var(--cyan-40)" : "1px solid var(--border-subtle)",
                }}
              >
                {skill}
              </span>
            ))}
            {c.skills.length > 8 && (
              <span className="text-[10px] px-1.5 py-0.5" style={{ color: "var(--text-muted)" }}>
                +{c.skills.length - 8}
              </span>
            )}
          </div>

          {/* Meta info row */}
          <div className="flex items-center gap-3 mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            {c.experience_years != null && <span>{c.experience_years}yr exp</span>}
            {c.location && <span>{c.location}</span>}
            {c.salary_min != null && (
              <span style={{ fontFeatureSettings: "'tnum'" }}>
                ${Math.round(c.salary_min / 1000)}K
                {c.salary_max != null && `–$${Math.round(c.salary_max / 1000)}K`}
              </span>
            )}
            {c.is_remote_ok && (
              <span style={{ color: "var(--cyan)" }}>Remote OK</span>
            )}
          </div>

          {/* Score breakdown bars */}
          <div className="mt-3 space-y-1">
            {SCORE_DIMENSIONS.map(({ key, label, color }) => {
              const val = match.score_breakdown[key] ?? 0;
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[9px] w-16 text-right shrink-0" style={{ color: "var(--text-muted)" }}>
                    {label}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: "var(--bg-elevated)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${val}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="text-[9px] w-6 text-right" style={{ color: "var(--text-muted)", fontFeatureSettings: "'tnum'" }}>
                    {Math.round(val)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Explanation */}
          {match.explanation && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-[11px] font-medium"
                style={{ color: "var(--cyan)" }}
              >
                {expanded ? "Hide" : "Show"} AI Analysis
              </button>
              {expanded && (
                <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {match.explanation}
                </p>
              )}
            </div>
          )}

          {/* Quick actions */}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => onShortlist(c.candidate_id)}
              className="text-[11px] px-3 py-1.5 rounded-lg font-medium transition-colors"
              style={{ backgroundColor: "var(--green-15)", color: "var(--green)" }}
            >
              Shortlist
            </button>
            <button
              type="button"
              onClick={() => onGenerateOutreach(c.candidate_id)}
              className="text-[11px] px-3 py-1.5 rounded-lg font-medium transition-colors"
              style={{ backgroundColor: "var(--cyan-15)", color: "var(--cyan)" }}
            >
              Outreach
            </button>
            <button
              type="button"
              onClick={() => onAddPipeline(c.candidate_id)}
              className="text-[11px] px-3 py-1.5 rounded-lg font-medium transition-colors"
              style={{ backgroundColor: "var(--purple-15)", color: "var(--purple)" }}
            >
              Pipeline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RecruiterSearchPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [brief, setBrief] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [candidates, setCandidates] = useState<CandidateMatch[]>([]);
  const [parsedBrief, setParsedBrief] = useState<Record<string, unknown> | null>(null);
  const [clarifyingQuestions, setClarifyingQuestions] = useState<string[]>([]);
  const [currentSearchId, setCurrentSearchId] = useState<string | null>(null);
  const [searches, setSearches] = useState<SearchListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sortBy, setSortBy] = useState<"score" | "experience" | "salary">("score");
  const [minScore, setMinScore] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auth guard
  useEffect(() => {
    if (!authLoading && (!user || (user.role !== "recruiter" && user.role !== "admin"))) {
      router.push("/seeker");
    }
  }, [user, authLoading, router]);

  // Load search history
  useEffect(() => {
    api.get<SearchListItem[]>("/recruiter/searches").then(setSearches).catch(() => {});
  }, [currentSearchId]);

  // Scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSearch = useCallback(async () => {
    if (!brief.trim() || searching) return;
    setSearching(true);
    setMessages((prev) => [...prev, { role: "user", content: brief, created_at: null }]);

    try {
      const res = await api.post<SearchResponse>("/recruiter/search", { brief });
      setCurrentSearchId(res.search_id);
      setCandidates(res.candidates);
      setParsedBrief(res.parsed_brief || null);
      setClarifyingQuestions(res.clarifying_questions || []);

      const assistantMsg = res.candidates.length > 0
        ? `Found ${res.candidates.length} candidates. Top match: ${res.candidates[0].candidate.full_name} (${Math.round(res.candidates[0].match_score)}%)`
        : res.clarifying_questions?.length
          ? "I need a bit more detail to find the best matches."
          : "No candidates found matching your criteria.";
      setMessages((prev) => [...prev, { role: "assistant", content: assistantMsg, created_at: null }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong. Please try again.", created_at: null }]);
    } finally {
      setSearching(false);
      setBrief("");
    }
  }, [brief, searching]);

  const handleRefine = useCallback(async () => {
    if (!brief.trim() || !currentSearchId || searching) return;
    setSearching(true);
    setMessages((prev) => [...prev, { role: "user", content: brief, created_at: null }]);

    try {
      const res = await api.post<SearchResponse>(`/recruiter/search/${currentSearchId}/refine`, { message: brief });
      setCandidates(res.candidates);
      setParsedBrief(res.parsed_brief || null);

      const msg = `Refined: ${res.candidates.length} candidates. ${res.candidates.length > 0 ? `Top: ${res.candidates[0].candidate.full_name} (${Math.round(res.candidates[0].match_score)}%)` : ""}`;
      setMessages((prev) => [...prev, { role: "assistant", content: msg, created_at: null }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Could not refine. Try again.", created_at: null }]);
    } finally {
      setSearching(false);
      setBrief("");
    }
  }, [brief, currentSearchId, searching]);

  const loadSearch = useCallback(async (searchId: string) => {
    try {
      const res = await api.get<SearchResponse>(`/recruiter/search/${searchId}`);
      setCurrentSearchId(res.search_id);
      setCandidates(res.candidates);
      setParsedBrief(res.parsed_brief || null);
      const msgs = await api.get<ChatMessage[]>(`/recruiter/search/${searchId}/messages`);
      setMessages(msgs);
    } catch { /* ignore */ }
  }, []);

  const handleShortlist = (candidateId: string) => {
    // TODO: Update search result status to shortlisted
  };

  const handleOutreach = async (candidateId: string) => {
    if (!currentSearchId) return;
    try {
      await api.post("/recruiter/outreach/generate", {
        candidate_id: candidateId,
        search_id: currentSearchId,
        channel: "email",
        tone: "professional",
      });
      router.push("/recruiter/outreach");
    } catch { /* ignore */ }
  };

  const handlePipeline = async (candidateId: string) => {
    try {
      await api.post("/recruiter/pipeline", {
        candidate_id: candidateId,
        search_id: currentSearchId,
      });
    } catch { /* ignore */ }
  };

  // Sort and filter candidates
  const displayCandidates = candidates
    .filter((m) => m.match_score >= minScore)
    .sort((a, b) => {
      if (sortBy === "score") return b.match_score - a.match_score;
      if (sortBy === "experience") return (b.candidate.experience_years ?? 0) - (a.candidate.experience_years ?? 0);
      if (sortBy === "salary") return (b.candidate.salary_max ?? 0) - (a.candidate.salary_max ?? 0);
      return 0;
    });

  if (authLoading) return null;

  return (
    <div style={{ backgroundColor: "var(--bg-deep)", minHeight: "100vh" }}>
      <TopNav showSearch={false} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6" style={{ minHeight: "calc(100vh - 120px)" }}>
          {/* Left Panel — Chat */}
          <div className="w-full lg:w-1/2 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                AI Candidate Search
              </h1>
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
              >
                {showHistory ? "Hide" : "Show"} History
              </button>
            </div>

            {/* Search history sidebar */}
            {showHistory && searches.length > 0 && (
              <div
                className="mb-4 rounded-xl p-3 space-y-1 max-h-48 overflow-y-auto"
                style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
              >
                {searches.map((s) => (
                  <button
                    key={s.search_id}
                    type="button"
                    onClick={() => loadSearch(s.search_id)}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs transition-colors truncate"
                    style={{
                      color: s.search_id === currentSearchId ? "var(--cyan)" : "var(--text-secondary)",
                      backgroundColor: s.search_id === currentSearchId ? "var(--cyan-08)" : "transparent",
                    }}
                  >
                    {s.brief.slice(0, 60)}{s.brief.length > 60 ? "..." : ""}
                  </button>
                ))}
              </div>
            )}

            {/* Chat messages */}
            <div
              className="flex-1 rounded-xl p-4 space-y-3 overflow-y-auto mb-4"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)", maxHeight: "calc(100vh - 320px)" }}
            >
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-3">
                    <svg className="w-12 h-12 mx-auto" viewBox="0 0 48 48" fill="none" style={{ color: "var(--text-muted)" }}>
                      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" />
                      <path d="M16 24h16M24 16v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                      Describe your ideal candidate to start searching
                    </p>
                    <div className="space-y-1">
                      {["Senior React developer in NYC, 5+ years", "ML engineer, Python, remote OK, $150-200K", "DevOps lead with AWS and Kubernetes experience"].map((example) => (
                        <button
                          key={example}
                          type="button"
                          onClick={() => setBrief(example)}
                          className="block w-full text-left text-xs px-3 py-2 rounded-lg transition-colors"
                          style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)" }}
                        >
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className="max-w-[85%] rounded-xl px-4 py-2.5 text-sm"
                    style={{
                      backgroundColor: msg.role === "user" ? "var(--cyan-15)" : "var(--bg-elevated)",
                      color: "var(--text-primary)",
                      border: msg.role === "user" ? "1px solid var(--cyan-40)" : "1px solid var(--border-subtle)",
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Clarifying questions */}
              {clarifyingQuestions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {clarifyingQuestions.map((q, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setBrief(q)}
                      className="text-xs px-3 py-1.5 rounded-full transition-colors"
                      style={{ backgroundColor: "var(--gold-15)", color: "var(--gold)", border: "1px solid var(--gold)" }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {searching && (
                <div className="flex justify-start">
                  <div
                    className="rounded-xl px-4 py-2.5 text-sm"
                    style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)" }}
                  >
                    <span className="inline-flex gap-1">
                      <span className="animate-pulse">Searching</span>
                      <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>.</span>
                      <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>.</span>
                      <span className="animate-pulse" style={{ animationDelay: "0.6s" }}>.</span>
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div
              className="rounded-xl p-3"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            >
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Describe your ideal candidate..."
                className="w-full bg-transparent text-sm resize-none outline-none"
                style={{ color: "var(--text-primary)", minHeight: "60px" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    currentSearchId ? handleRefine() : handleSearch();
                  }
                }}
              />
              <div className="flex justify-between items-center mt-2">
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {currentSearchId ? "Refining search" : "New search"} · Enter to send
                </span>
                <div className="flex gap-2">
                  {currentSearchId && (
                    <button
                      type="button"
                      onClick={() => { setCurrentSearchId(null); setCandidates([]); setMessages([]); setParsedBrief(null); }}
                      className="text-xs px-3 py-1.5 rounded-lg"
                      style={{ color: "var(--text-muted)" }}
                    >
                      New Search
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={currentSearchId ? handleRefine : handleSearch}
                    disabled={!brief.trim() || searching}
                    className="text-xs px-4 py-1.5 rounded-lg font-medium transition-all"
                    style={{
                      backgroundColor: brief.trim() ? "var(--cyan)" : "var(--bg-elevated)",
                      color: brief.trim() ? "var(--text-inverse)" : "var(--text-muted)",
                      opacity: searching ? 0.6 : 1,
                    }}
                  >
                    {searching ? "Searching..." : currentSearchId ? "Refine" : "Search"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel — Candidate Results */}
          <div className="hidden lg:flex lg:w-1/2 flex-col">
            {/* Controls */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                {displayCandidates.length > 0
                  ? `${displayCandidates.length} candidate${displayCandidates.length !== 1 ? "s" : ""}`
                  : "No results yet"}
              </h2>
              <div className="flex items-center gap-2">
                <label className="text-[10px]" style={{ color: "var(--text-muted)" }}>Min Score</label>
                <input
                  type="range"
                  min={0} max={100} value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="w-16 h-1 accent-[var(--cyan)]"
                />
                <span className="text-[10px] w-6" style={{ color: "var(--text-muted)", fontFeatureSettings: "'tnum'" }}>
                  {minScore}
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "score" | "experience" | "salary")}
                  className="text-xs rounded-lg px-2 py-1 outline-none"
                  style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
                >
                  <option value="score">Best Match</option>
                  <option value="experience">Experience</option>
                  <option value="salary">Salary</option>
                </select>
              </div>
            </div>

            {/* Candidate list */}
            <div className="flex-1 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 180px)" }}>
              {displayCandidates.map((match) => (
                <CandidateCard
                  key={match.candidate.candidate_id}
                  match={match}
                  parsedBrief={parsedBrief}
                  onShortlist={handleShortlist}
                  onGenerateOutreach={handleOutreach}
                  onAddPipeline={handlePipeline}
                />
              ))}
              {candidates.length === 0 && messages.length > 0 && !searching && (
                <div className="flex items-center justify-center h-64">
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    No candidates found. Try broadening your search.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <MobileNav />
    </div>
  );
}
