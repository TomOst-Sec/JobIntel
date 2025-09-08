"use client";

import { useState } from "react";

const componentData: Record<string, { title: string; subtitle: string; kills: string; color: string; bgColor: string; borderColor: string; modules: { name: string; desc: string; priority: string; complexity: number }[] }> = {
  identity: {
    title: "IDENTITY ENGINE",
    subtitle: "You are what you BUILD",
    kills: "LinkedIn profiles, Toptal vetting, Dice resumes",
    color: "#00F5D4",
    bgColor: "rgba(0,245,212,0.08)",
    borderColor: "rgba(0,245,212,0.3)",
    modules: [
      { name: "Proof-of-Work Profile", desc: "Auto-built from GitHub, Kaggle, deployed projects. AI analyzes code quality, contribution patterns, and shipped products.", priority: "P0", complexity: 5 },
      { name: "Skill Graph", desc: "DAG of capabilities with proficiency levels derived from actual code, not self-reporting. Nodes = skills, edges = relationships.", priority: "P0", complexity: 5 },
      { name: "Build Score", desc: "Composite metric: code quality + shipping consistency + collaboration + growth trajectory. Your real-time developer rating.", priority: "P0", complexity: 4 },
      { name: "Portable Reputation", desc: "W3C Verifiable Credentials. Take your reputation anywhere. Anti-lock-in by design.", priority: "P1", complexity: 3 },
      { name: "Credential Verification", desc: "Employment via domain email, education via university APIs, certs via provider APIs, income via Plaid.", priority: "P1", complexity: 3 },
    ]
  },
  signal: {
    title: "SIGNAL LAYER",
    subtitle: "X's speed + HN's depth + Glassdoor's truth",
    kills: "LinkedIn feed, X noise, Glassdoor manipulation, HN limitations",
    color: "#FEE440",
    bgColor: "rgba(254,228,64,0.08)",
    borderColor: "rgba(254,228,64,0.3)",
    modules: [
      { name: "Tech Feed", desc: "Real-time discourse for builders. Algorithm rewards substance over engagement. Build Score visible on every post = built-in credibility.", priority: "P0", complexity: 4 },
      { name: "Anti-Cringe Engine", desc: "AI detects broetry, engagement bait, follow-farming. Demotes performative content. Promotes technical depth.", priority: "P1", complexity: 3 },
      { name: "Verified Reviews", desc: "Attributed but protected. Tied to verified employment. Employers can't remove. AI detects manipulation. Legal shield for reviewers.", priority: "P0", complexity: 4 },
      { name: "Salary Intelligence", desc: "Real-time verified comp data from payroll integrations + offer letters. AI predicts your market value with confidence intervals.", priority: "P0", complexity: 5 },
      { name: "Launch Feed", desc: "Ship announcements integrated into the feed. Like Product Hunt but for the builder community. Instant feedback loop.", priority: "P2", complexity: 2 },
    ]
  },
  matching: {
    title: "MATCHING ENGINE",
    subtitle: "AI replaces 10 recruiters + 5 job boards",
    kills: "Indeed search, Easy Apply, recruiter spam, manual sourcing",
    color: "#9B5DE5",
    bgColor: "rgba(155,93,229,0.08)",
    borderColor: "rgba(155,93,229,0.3)",
    modules: [
      { name: "AI Job Matching", desc: "Bi-directional scoring. Rates the JOB for the candidate, not just the candidate for the job. Explainable match reasoning.", priority: "P0", complexity: 5 },
      { name: "Personal AI Agent", desc: "24/7 autonomous job search. Monitors market, alerts on matches, drafts outreach, preps for interviews, negotiates comp.", priority: "P0", complexity: 5 },
      { name: "Job Board 3.0", desc: "Every listing requires: salary range, pipeline timeline, team Build Scores, interview ratings, success probability for your profile.", priority: "P0", complexity: 4 },
      { name: "Freelance Marketplace", desc: "Same profiles, same reputation. Escrow + milestones. AI-matched (no bidding). Flat transparent take rate (5-8%).", priority: "P1", complexity: 4 },
      { name: "Startup Hub", desc: "Co-founder matching via complementary skill graphs. Equity calculator. Demo day feed. Startup-mode candidate pools.", priority: "P2", complexity: 4 },
      { name: "Built-in ATS", desc: "Replaces Greenhouse/Lever for most companies. Structured hiring with scorecards. AI-powered pipeline optimization.", priority: "P1", complexity: 5 },
    ]
  },
  transaction: {
    title: "TRANSACTION LAYER",
    subtitle: "The trust infrastructure",
    kills: "Upwork's delays, Toptal's opacity, fragmented payment tools",
    color: "#F15BB5",
    bgColor: "rgba(241,91,181,0.08)",
    borderColor: "rgba(241,91,181,0.3)",
    modules: [
      { name: "Smart Escrow", desc: "Milestone-based payment release. AI-assisted dispute resolution. Automatic tax documentation.", priority: "P1", complexity: 4 },
      { name: "Offer Comparison", desc: "Side-by-side total comp analysis: salary + equity + benefits + growth potential + company health score.", priority: "P1", complexity: 3 },
      { name: "Negotiation AI", desc: "Powered by salary intelligence. Suggests counter-offers based on market data. Knows when to push vs accept.", priority: "P2", complexity: 4 },
      { name: "Payments", desc: "Multi-currency, instant payouts for freelancers, transparent FX. Optional crypto payments.", priority: "P1", complexity: 3 },
    ]
  },
  ai: {
    title: "AI SUBSTRATE",
    subtitle: "Not a feature. The foundation.",
    kills: "Every bolted-on AI feature on every competitor",
    color: "#00BBF9",
    bgColor: "rgba(0,187,249,0.08)",
    borderColor: "rgba(0,187,249,0.3)",
    modules: [
      { name: "Code Analyzer", desc: "Evaluates code quality, patterns, skill depth from GitHub repos. Powers Build Score and Skill Graph.", priority: "P0", complexity: 5 },
      { name: "Match Engine Core", desc: "Graph neural network operating on skill graphs + preference vectors. Bi-directional scoring with explainability.", priority: "P0", complexity: 5 },
      { name: "Feed Curator", desc: "Content ranking by substance, not engagement. Detects and demotes manipulation patterns.", priority: "P0", complexity: 4 },
      { name: "Fraud Sentinel", desc: "Detects fake profiles, credential fraud, contribution padding, AI-generated fake applications.", priority: "P0", complexity: 4 },
      { name: "Career Pathfinder", desc: "Projects career trajectories. Suggests skill development based on market demand trends and personal goals.", priority: "P2", complexity: 4 },
      { name: "Agent Orchestrator", desc: "Coordinates personal AI agents. Manages concurrent job searches, freelance pipelines, and networking.", priority: "P1", complexity: 5 },
    ]
  }
};

const phaseData = [
  { phase: "1", name: "The Wedge", time: "0-6mo", focus: "Senior engineers, GitHub-first", targets: "1K\u219210K users", color: "#00F5D4" },
  { phase: "2", name: "Supply Gravity", time: "6-18mo", focus: "All engineers, freelance, salary intel", targets: "10K\u2192100K users", color: "#FEE440" },
  { phase: "3", name: "Demand Capture", time: "18-36mo", focus: "Built-in ATS, AI agents, expand roles", targets: "100K\u21921M users", color: "#9B5DE5" },
  { phase: "4", name: "Dominance", time: "36mo+", focus: "API ecosystem, credentials, education", targets: "1M\u219210M+ users", color: "#F15BB5" },
];

const moatTimeline = [
  { year: "Y1", moat: "Quality Signal", desc: "PoW profiles attract top talent" },
  { year: "Y2", moat: "Data Network Effects", desc: "More matches \u2192 smarter AI" },
  { year: "Y3", moat: "Platform Network Effects", desc: "Engineers + employers + startups" },
  { year: "Y4+", moat: "Ecosystem Lock-in", desc: "ATS + marketplace + reputation + credentials" },
];

const revenueStreams = [
  { stream: "Placement Fees", pct: "60%", model: "10-15% first-year salary on hire", aligned: "Only earn on successful matches" },
  { stream: "Freelance Take Rate", pct: "20%", model: "5-8% on completed contracts", aligned: "Lower than Upwork (10%), way lower than Toptal (40-75%)" },
  { stream: "Premium Employer", pct: "12%", model: "Analytics, branding, priority matching", aligned: "Better visibility, not gatekeeping" },
  { stream: "Premium Candidate", pct: "5%", model: "Advanced AI agent, interview prep", aligned: "Core experience is free" },
  { stream: "API / Data", pct: "3%", model: "Anonymized market intelligence", aligned: "No PII sold, ever" },
];

const killMatrix = [
  { victim: "LinkedIn", reason: "Business model = self-reported data + engagement farming. Switching to PoW invalidates 1.2B profiles and kills ad revenue.", vulnerability: "Cringe feed, paywalls, spam, fake endorsements, algorithmic throttling", color: "#0077B5" },
  { victim: "Indeed", reason: "Search engine for jobs, not identity platform. No social layer, no skill verification, no community.", vulnerability: "Keyword matching is obsolete. Google Jobs eating their SEO moat.", color: "#2164f3" },
  { victim: "Glassdoor", reason: "Locked into anonymous reviews. Switching to verified kills volume. Employer manipulation erodes trust.", vulnerability: "Fake reviews, outdated data, no skill verification", color: "#0caa41" },
  { victim: "Upwork", reason: "Race-to-the-bottom marketplace dynamics. Average $21/hr makes premium positioning impossible.", vulnerability: "AI replacing commodity freelance work. Stock down 61% in 12 months.", color: "#14a800" },
  { victim: "Greenhouse/Lever", reason: "ATS-only. No candidate-facing product. No community. No content. Pure infrastructure.", vulnerability: "Becoming commodity as HRIS platforms (Workday, SAP) absorb ATS features.", color: "#3ab549" },
  { victim: "HireEZ/SeekOut", reason: "Recruiter tools scraping stale LinkedIn data. No candidate platform, no community, no content.", vulnerability: "Data freshness problems. If the source data improves (NEXUS), scrapers become obsolete.", color: "#ff6b35" },
];

export default function NexusArchitecture() {
  const [activeComponent, setActiveComponent] = useState("identity");
  const [activeTab, setActiveTab] = useState("components");
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  const active = componentData[activeComponent];
  const componentKeys = Object.keys(componentData);

  return (
    <div style={{ fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace", background: "#0a0a0f", color: "#e0e0e0", minHeight: "100vh", padding: "20px" }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "32px", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "24px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 800, background: "linear-gradient(135deg, #00F5D4, #9B5DE5, #F15BB5)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: 0, letterSpacing: "-1px" }}>
          NEXUS
        </h1>
        <p style={{ fontSize: "11px", color: "#666", marginTop: "6px", letterSpacing: "3px", textTransform: "uppercase" }}>
          The Operating System for Tech Careers
        </p>
        <p style={{ fontSize: "12px", color: "#444", marginTop: "4px", fontStyle: "italic" }}>
          &ldquo;You are what you BUILD, not what you CLAIM&rdquo;
        </p>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", justifyContent: "center", flexWrap: "wrap" }}>
        {[
          { id: "components", label: "Component Map" },
          { id: "growth", label: "Growth Phases" },
          { id: "revenue", label: "Revenue Model" },
          { id: "moat", label: "Moat Timeline" },
          { id: "kills", label: "Kill Matrix" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "8px 16px",
              fontSize: "11px",
              background: activeTab === tab.id ? "rgba(255,255,255,0.1)" : "transparent",
              color: activeTab === tab.id ? "#fff" : "#555",
              border: `1px solid ${activeTab === tab.id ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.05)"}`,
              borderRadius: "4px",
              cursor: "pointer",
              transition: "all 0.2s",
              letterSpacing: "0.5px",
              textTransform: "uppercase" as const,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* COMPONENTS TAB */}
      {activeTab === "components" && (
        <div>
          <div style={{ display: "flex", gap: "6px", marginBottom: "20px", flexWrap: "wrap", justifyContent: "center" }}>
            {componentKeys.map(key => {
              const comp = componentData[key];
              const isActive = activeComponent === key;
              return (
                <button
                  key={key}
                  onClick={() => { setActiveComponent(key); setExpandedModule(null); }}
                  style={{
                    padding: "10px 16px", fontSize: "11px", fontWeight: 700,
                    background: isActive ? comp.bgColor : "transparent",
                    color: isActive ? comp.color : "#555",
                    border: `1px solid ${isActive ? comp.borderColor : "rgba(255,255,255,0.06)"}`,
                    borderRadius: "6px", cursor: "pointer", transition: "all 0.25s",
                    fontFamily: "inherit", letterSpacing: "0.5px",
                  }}
                >
                  {comp.title}
                </button>
              );
            })}
          </div>

          <div style={{ border: `1px solid ${active.borderColor}`, borderRadius: "10px", padding: "24px", background: active.bgColor, marginBottom: "20px" }}>
            <div style={{ marginBottom: "16px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 800, color: active.color, margin: 0 }}>{active.title}</h2>
              <p style={{ fontSize: "13px", color: "#999", margin: "4px 0 0" }}>{active.subtitle}</p>
              <p style={{ fontSize: "11px", color: "#555", margin: "8px 0 0" }}>
                <span style={{ color: "#ff4444", fontWeight: 700 }}>KILLS:</span> {active.kills}
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column" as const, gap: "8px" }}>
              {active.modules.map((mod, i) => {
                const isExpanded = expandedModule === `${activeComponent}-${i}`;
                return (
                  <div
                    key={i}
                    onClick={() => setExpandedModule(isExpanded ? null : `${activeComponent}-${i}`)}
                    style={{
                      background: isExpanded ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${isExpanded ? active.borderColor : "rgba(255,255,255,0.04)"}`,
                      borderRadius: "8px", padding: "14px 16px", cursor: "pointer", transition: "all 0.2s",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{
                          fontSize: "9px", padding: "2px 6px", borderRadius: "3px", fontWeight: 700,
                          background: mod.priority === "P0" ? "rgba(255,68,68,0.2)" : mod.priority === "P1" ? "rgba(254,228,64,0.2)" : "rgba(100,100,100,0.2)",
                          color: mod.priority === "P0" ? "#ff4444" : mod.priority === "P1" ? "#FEE440" : "#888",
                        }}>
                          {mod.priority}
                        </span>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "#e0e0e0" }}>{mod.name}</span>
                      </div>
                      <div style={{ display: "flex", gap: "2px" }}>
                        {Array.from({ length: 5 }, (_, j) => (
                          <div key={j} style={{ width: "8px", height: "8px", borderRadius: "2px", background: j < mod.complexity ? active.color : "rgba(255,255,255,0.06)" }} />
                        ))}
                      </div>
                    </div>
                    {isExpanded && (
                      <p style={{ fontSize: "12px", color: "#999", margin: "10px 0 0", lineHeight: "1.6", paddingLeft: "50px" }}>
                        {mod.desc}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: "20px", justifyContent: "center", fontSize: "10px", color: "#555" }}>
            <span><span style={{ color: "#ff4444" }}>&#9632;</span> P0 = MVP Critical</span>
            <span><span style={{ color: "#FEE440" }}>&#9632;</span> P1 = Phase 2</span>
            <span><span style={{ color: "#888" }}>&#9632;</span> P2 = Phase 3+</span>
            <span>Blocks = Build Complexity (1-5)</span>
          </div>
        </div>
      )}

      {/* GROWTH TAB */}
      {activeTab === "growth" && (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: "12px" }}>
          <h3 style={{ fontSize: "14px", color: "#888", textAlign: "center" as const, margin: "0 0 8px", letterSpacing: "2px", textTransform: "uppercase" as const }}>Growth Playbook</h3>
          {phaseData.map((p, i) => (
            <div key={i} style={{ border: `1px solid ${p.color}33`, borderRadius: "10px", padding: "20px", background: `${p.color}08` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "24px", fontWeight: 900, color: p.color }}>{p.phase}</span>
                  <div>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "#e0e0e0" }}>{p.name}</div>
                    <div style={{ fontSize: "11px", color: "#666" }}>{p.time}</div>
                  </div>
                </div>
                <span style={{ fontSize: "12px", color: p.color, fontWeight: 600, background: `${p.color}15`, padding: "4px 10px", borderRadius: "4px" }}>{p.targets}</span>
              </div>
              <p style={{ fontSize: "12px", color: "#999", margin: 0 }}>{p.focus}</p>
            </div>
          ))}
          <div style={{ textAlign: "center" as const, marginTop: "8px" }}>
            <div style={{ fontSize: "24px" }}>&darr;</div>
            <p style={{ fontSize: "12px", color: "#00F5D4", fontWeight: 600 }}>FLYWHEEL: More engineers &rarr; Better matches &rarr; More employers &rarr; More engineers</p>
          </div>
        </div>
      )}

      {/* REVENUE TAB */}
      {activeTab === "revenue" && (
        <div>
          <h3 style={{ fontSize: "14px", color: "#888", textAlign: "center" as const, margin: "0 0 16px", letterSpacing: "2px", textTransform: "uppercase" as const }}>Aligned Revenue &mdash; We Win When You Win</h3>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: "8px" }}>
            {revenueStreams.map((r, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#e0e0e0" }}>{r.stream}</span>
                  <span style={{ fontSize: "18px", fontWeight: 900, color: "#00F5D4" }}>{r.pct}</span>
                </div>
                <p style={{ fontSize: "11px", color: "#888", margin: "0 0 4px" }}>{r.model}</p>
                <p style={{ fontSize: "10px", color: "#00F5D4", margin: 0 }}>{"\u2713"} {r.aligned}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "16px", padding: "16px", background: "rgba(255,68,68,0.05)", border: "1px solid rgba(255,68,68,0.2)", borderRadius: "8px" }}>
            <p style={{ fontSize: "12px", fontWeight: 700, color: "#ff4444", margin: "0 0 8px" }}>WHAT WE NEVER DO:</p>
            <div style={{ fontSize: "11px", color: "#999", lineHeight: "1.8" }}>
              {"\u2717"} No ads, ever &nbsp;&middot;&nbsp; {"\u2717"} No data selling &nbsp;&middot;&nbsp; {"\u2717"} No engagement farming &nbsp;&middot;&nbsp; {"\u2717"} No paywall on core features &nbsp;&middot;&nbsp; {"\u2717"} No algorithmic throttling
            </div>
          </div>
        </div>
      )}

      {/* MOAT TAB */}
      {activeTab === "moat" && (
        <div>
          <h3 style={{ fontSize: "14px", color: "#888", textAlign: "center" as const, margin: "0 0 16px", letterSpacing: "2px", textTransform: "uppercase" as const }}>Moat Evolution</h3>
          <div style={{ position: "relative" as const, paddingLeft: "40px" }}>
            <div style={{ position: "absolute" as const, left: "18px", top: 0, bottom: 0, width: "2px", background: "linear-gradient(to bottom, #00F5D4, #9B5DE5, #F15BB5)" }} />
            {moatTimeline.map((m, i) => {
              const colors = ["#00F5D4", "#FEE440", "#9B5DE5", "#F15BB5"];
              return (
                <div key={i} style={{ position: "relative" as const, marginBottom: "24px" }}>
                  <div style={{ position: "absolute" as const, left: "-30px", top: "8px", width: "14px", height: "14px", borderRadius: "50%", background: colors[i], border: "3px solid #0a0a0f" }} />
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "16px" }}>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 900, color: colors[i] }}>{m.year}</span>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: "#e0e0e0" }}>{m.moat}</span>
                    </div>
                    <p style={{ fontSize: "12px", color: "#888", margin: 0 }}>{m.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KILL MATRIX TAB */}
      {activeTab === "kills" && (
        <div>
          <h3 style={{ fontSize: "14px", color: "#888", textAlign: "center" as const, margin: "0 0 16px", letterSpacing: "2px", textTransform: "uppercase" as const }}>Why They Can&apos;t Copy This</h3>
          {killMatrix.map((k, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "16px", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: 800, color: k.color }}>{k.victim}</span>
                <span style={{ fontSize: "10px", color: "#ff4444" }}>{"\u2620"}</span>
              </div>
              <p style={{ fontSize: "11px", color: "#999", margin: "0 0 6px" }}>
                <span style={{ color: "#ff4444", fontWeight: 600 }}>Why they can&apos;t adapt: </span>{k.reason}
              </p>
              <p style={{ fontSize: "11px", color: "#666", margin: 0 }}>
                <span style={{ color: "#FEE440", fontWeight: 600 }}>Current weakness: </span>{k.vulnerability}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: "center" as const, marginTop: "32px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <p style={{ fontSize: "10px", color: "#333", letterSpacing: "1px" }}>NEXUS ARCHITECTURE v1.0 &mdash; COMPONENT MAP</p>
      </div>
    </div>
  );
}
