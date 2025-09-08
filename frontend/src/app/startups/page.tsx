"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TopNav } from "@/components/layout/top-nav";
import { BuildScore } from "@/components/ui/build-score";

interface Startup {
    id: number;
    name: string;
    slug: string;
    tagline: string;
    description: string;
    stage: string;
    industry: string;
    location: string;
    remote_friendly: number;
    team_size: number;
    funding_total: number;
    looking_for_cofounder: number;
    cofounder_skills_needed: string[];
    founder_name: string;
    founder_build_score: number | null;
    created_at: string;
}

interface EquityResult {
    total_shares: number;
    option_pool_pct: number;
    price_per_share: number | null;
    founders: { name: string; equity_pct: number; shares: number; exit_outcomes: Record<string, number> }[];
    exit_scenarios: number[];
}

const stageColors: Record<string, string> = {
    idea: "#666", pre_seed: "#9B5DE5", seed: "#00BBF9", series_a: "#00F5D4",
    series_b: "#FEE440", growth: "#F15BB5", public: "#ff6b35",
};

export default function StartupHubPage() {
    const { user } = useAuth();
    const [tab, setTab] = useState<"browse" | "create" | "equity">("browse");
    const [startups, setStartups] = useState<Startup[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterCofounder, setFilterCofounder] = useState(false);

    // Create form
    const [form, setForm] = useState({
        name: "", tagline: "", description: "", stage: "pre_seed",
        industry: "", location: "", looking_for_cofounder: false,
        cofounder_skills_needed: "",
    });
    const [creating, setCreating] = useState(false);

    // Equity calculator
    const [equityForm, setEquityForm] = useState({
        total_shares: "10000000", option_pool_pct: "15",
        last_valuation: "", founders: "Founder 1:60, Founder 2:40",
    });
    const [equityResult, setEquityResult] = useState<EquityResult | null>(null);

    useEffect(() => { loadStartups(); }, [filterCofounder]);

    async function loadStartups() {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterCofounder) params.set("looking_for_cofounder", "true");
            const data = await api.get<{ startups: Startup[] }>(`/startups?${params}`);
            setStartups(data.startups);
        } catch { } finally { setLoading(false); }
    }

    async function handleCreate() {
        if (!form.name.trim()) return;
        setCreating(true);
        try {
            await api.post("/startups", {
                ...form,
                cofounder_skills_needed: form.cofounder_skills_needed.split(",").map(s => s.trim()).filter(Boolean),
            });
            setForm({ name: "", tagline: "", description: "", stage: "pre_seed", industry: "", location: "", looking_for_cofounder: false, cofounder_skills_needed: "" });
            setTab("browse");
            loadStartups();
        } finally { setCreating(false); }
    }

    async function handleEquityCalc() {
        const founders = equityForm.founders.split(",").map(f => {
            const [name, pct] = f.trim().split(":");
            return { name: name?.trim() || "Founder", equity_pct: parseFloat(pct) || 0 };
        });
        try {
            const result = await api.post<EquityResult>("/startups/equity-calculator", {
                total_shares: parseInt(equityForm.total_shares) || 10000000,
                option_pool_pct: parseFloat(equityForm.option_pool_pct) || 15,
                last_valuation: equityForm.last_valuation ? parseFloat(equityForm.last_valuation) : null,
                founders,
            });
            setEquityResult(result);
        } catch { }
    }

    return (
        <>
            <TopNav />
            <main className="max-w-5xl mx-auto px-4 py-8">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Startup Hub</h1>
                    <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                        Find co-founders, discover startups, and calculate equity outcomes.
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mb-6">
                    {(["browse", "create", "equity"] as const).map(t => (
                        <button key={t} onClick={() => setTab(t)}
                            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                            style={{
                                backgroundColor: tab === t ? "var(--cyan-15)" : "transparent",
                                color: tab === t ? "var(--cyan)" : "var(--text-muted)",
                            }}>
                            {t === "browse" ? "Discover" : t === "create" ? "Launch" : "Equity Calculator"}
                        </button>
                    ))}
                </div>

                {/* Browse */}
                {tab === "browse" && (
                    <>
                        <div className="flex gap-2 mb-4">
                            <button onClick={() => setFilterCofounder(!filterCofounder)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                                style={{
                                    backgroundColor: filterCofounder ? "var(--cyan-15)" : "var(--bg-surface)",
                                    color: filterCofounder ? "var(--cyan)" : "var(--text-muted)",
                                    border: `1px solid ${filterCofounder ? "var(--cyan-30)" : "var(--border-subtle)"}`,
                                }}>
                                Looking for Co-founder
                            </button>
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                            {loading ? (
                                <div className="col-span-2 text-center py-10" style={{ color: "var(--text-muted)" }}>Loading startups...</div>
                            ) : startups.length === 0 ? (
                                <div className="col-span-2 rounded-xl p-8 text-center" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>No startups found. Launch yours!</p>
                                </div>
                            ) : startups.map(s => (
                                <div key={s.id} className="rounded-xl p-5" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{s.name}</h3>
                                            {s.tagline && <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{s.tagline}</p>}
                                        </div>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase"
                                            style={{ backgroundColor: `${stageColors[s.stage] || "#666"}20`, color: stageColors[s.stage] || "#666" }}>
                                            {s.stage.replace("_", " ")}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
                                        {s.industry && <span>{s.industry}</span>}
                                        {s.location && <span>{s.location}</span>}
                                        {s.remote_friendly ? <span style={{ color: "var(--cyan)" }}>Remote</span> : null}
                                        <span>{s.team_size} team</span>
                                        {s.funding_total > 0 && <span>${(s.funding_total / 1000000).toFixed(1)}M raised</span>}
                                    </div>
                                    {s.looking_for_cofounder ? (
                                        <div className="mt-3 p-2 rounded-lg" style={{ backgroundColor: "var(--cyan-08)", border: "1px solid var(--cyan-30)" }}>
                                            <p className="text-[10px] font-semibold" style={{ color: "var(--cyan)" }}>Looking for Co-founder</p>
                                            {s.cofounder_skills_needed?.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {s.cofounder_skills_needed.map(sk => (
                                                        <span key={sk} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)" }}>{sk}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : null}
                                    <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                                        <span>Founded by {s.founder_name}</span>
                                        {s.founder_build_score && <BuildScore score={s.founder_build_score} size="sm" />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* Create */}
                {tab === "create" && (
                    <div className="rounded-xl p-6 space-y-4" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Launch Your Startup</h2>
                        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Startup name"
                            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                            style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                        <input value={form.tagline} onChange={e => setForm({ ...form, tagline: e.target.value })} placeholder="One-line tagline"
                            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                            style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                        <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What are you building?" rows={4}
                            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-y"
                            style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                        <div className="grid md:grid-cols-3 gap-3">
                            <select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })}
                                className="px-3 py-2.5 rounded-lg text-sm outline-none"
                                style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}>
                                <option value="idea">Idea</option>
                                <option value="pre_seed">Pre-Seed</option>
                                <option value="seed">Seed</option>
                                <option value="series_a">Series A</option>
                                <option value="series_b">Series B</option>
                                <option value="growth">Growth</option>
                            </select>
                            <input value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} placeholder="Industry"
                                className="px-3 py-2.5 rounded-lg text-sm outline-none"
                                style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                            <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Location"
                                className="px-3 py-2.5 rounded-lg text-sm outline-none"
                                style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                        </div>
                        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                            <input type="checkbox" checked={form.looking_for_cofounder} onChange={e => setForm({ ...form, looking_for_cofounder: e.target.checked })} />
                            Looking for a co-founder
                        </label>
                        {form.looking_for_cofounder && (
                            <input value={form.cofounder_skills_needed} onChange={e => setForm({ ...form, cofounder_skills_needed: e.target.value })} placeholder="Skills needed (e.g. react, python, ml)"
                                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                                style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                        )}
                        <button onClick={handleCreate} disabled={creating || !form.name.trim()}
                            className="w-full py-2.5 rounded-lg text-sm font-medium"
                            style={{ backgroundColor: "var(--cyan)", color: "var(--text-inverse)", opacity: creating ? 0.6 : 1 }}>
                            {creating ? "Creating..." : "Launch Startup"}
                        </button>
                    </div>
                )}

                {/* Equity Calculator */}
                {tab === "equity" && (
                    <div className="space-y-6">
                        <div className="rounded-xl p-6" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                            <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Equity Calculator</h2>
                            <div className="grid md:grid-cols-2 gap-3 mb-4">
                                <label className="block">
                                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Total Shares</span>
                                    <input value={equityForm.total_shares} onChange={e => setEquityForm({ ...equityForm, total_shares: e.target.value })} type="number"
                                        className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                                </label>
                                <label className="block">
                                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Option Pool %</span>
                                    <input value={equityForm.option_pool_pct} onChange={e => setEquityForm({ ...equityForm, option_pool_pct: e.target.value })} type="number"
                                        className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                                </label>
                                <label className="block">
                                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Last Valuation ($)</span>
                                    <input value={equityForm.last_valuation} onChange={e => setEquityForm({ ...equityForm, last_valuation: e.target.value })} type="number" placeholder="Optional"
                                        className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                                </label>
                                <label className="block">
                                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Founders (Name:Pct, comma sep)</span>
                                    <input value={equityForm.founders} onChange={e => setEquityForm({ ...equityForm, founders: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                                </label>
                            </div>
                            <button onClick={handleEquityCalc}
                                className="px-6 py-2 rounded-lg text-sm font-medium"
                                style={{ backgroundColor: "var(--cyan)", color: "var(--text-inverse)" }}>
                                Calculate
                            </button>
                        </div>

                        {equityResult && (
                            <div className="rounded-xl p-6" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                                <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Exit Scenario Outcomes</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                                                <th className="text-left py-2 pr-4" style={{ color: "var(--text-muted)" }}>Founder</th>
                                                <th className="text-right py-2 pr-4" style={{ color: "var(--text-muted)" }}>Equity</th>
                                                <th className="text-right py-2 pr-4" style={{ color: "var(--text-muted)" }}>Shares</th>
                                                {equityResult.exit_scenarios.map(s => (
                                                    <th key={s} className="text-right py-2 pr-4" style={{ color: "var(--text-muted)" }}>${(s / 1000000).toFixed(0)}M exit</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {equityResult.founders.map((f, i) => (
                                                <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                                                    <td className="py-2 pr-4 font-medium" style={{ color: "var(--text-primary)" }}>{f.name}</td>
                                                    <td className="text-right py-2 pr-4" style={{ color: "var(--cyan)" }}>{f.equity_pct}%</td>
                                                    <td className="text-right py-2 pr-4 font-mono" style={{ color: "var(--text-secondary)" }}>{f.shares.toLocaleString()}</td>
                                                    {Object.values(f.exit_outcomes).map((val, j) => (
                                                        <td key={j} className="text-right py-2 pr-4 font-mono" style={{ color: "var(--text-primary)" }}>
                                                            ${val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}K` : val.toFixed(0)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-[10px] mt-3" style={{ color: "var(--text-muted)" }}>
                                    Option pool: {equityResult.option_pool_pct}% ({equityResult.total_shares.toLocaleString()} total shares)
                                    {equityResult.price_per_share && ` | PPS: $${equityResult.price_per_share}`}
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </>
    );
}
