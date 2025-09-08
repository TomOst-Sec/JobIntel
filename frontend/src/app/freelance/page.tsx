"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TopNav } from "@/components/layout/top-nav";
import { BuildScore } from "@/components/ui/build-score";

interface Project {
    id: number;
    title: string;
    description: string;
    client_name: string;
    client_build_score: number | null;
    budget_type: string;
    budget_min: number | null;
    budget_max: number | null;
    duration_days: number | null;
    required_skills: string[];
    experience_level: string;
    scope: string;
    status: string;
    applicant_count: number;
    created_at: string;
}

interface Contract {
    id: number;
    project_title: string;
    freelancer_name: string;
    client_name: string;
    rate_amount: number;
    rate_type: string;
    status: string;
    milestones: { id: number; title: string; amount: number; status: string }[];
}

export default function FreelancePage() {
    const { user } = useAuth();
    const [tab, setTab] = useState<"browse" | "my_contracts" | "post">("browse");
    const [projects, setProjects] = useState<Project[]>([]);
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);

    // Post form
    const [formData, setFormData] = useState({
        title: "", description: "", budget_type: "fixed", budget_min: "", budget_max: "",
        duration_days: "", experience_level: "mid", required_skills: "",
    });
    const [posting, setPosting] = useState(false);

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        try {
            const [projRes, contRes] = await Promise.all([
                api.get<{ projects: Project[] }>("/freelance/projects"),
                user ? api.get<{ contracts: Contract[] }>("/freelance/contracts").catch(() => ({ contracts: [] })) : Promise.resolve({ contracts: [] }),
            ]);
            setProjects(projRes.projects);
            setContracts(contRes.contracts);
        } catch { } finally { setLoading(false); }
    }

    async function handlePost() {
        if (!formData.title.trim() || !formData.description.trim()) return;
        setPosting(true);
        try {
            await api.post("/freelance/projects", {
                title: formData.title,
                description: formData.description,
                budget_type: formData.budget_type,
                budget_min: formData.budget_min ? parseFloat(formData.budget_min) : null,
                budget_max: formData.budget_max ? parseFloat(formData.budget_max) : null,
                duration_days: formData.duration_days ? parseInt(formData.duration_days) : null,
                experience_level: formData.experience_level,
                required_skills: formData.required_skills.split(",").map(s => s.trim()).filter(Boolean),
            });
            setFormData({ title: "", description: "", budget_type: "fixed", budget_min: "", budget_max: "", duration_days: "", experience_level: "mid", required_skills: "" });
            setTab("browse");
            loadData();
        } finally { setPosting(false); }
    }

    async function handleApply(projectId: number) {
        const letter = prompt("Cover letter (optional):");
        await api.post(`/freelance/projects/${projectId}/apply`, { cover_letter: letter || null });
        loadData();
    }

    function formatBudget(p: Project) {
        if (!p.budget_min && !p.budget_max) return "Open budget";
        const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
        if (p.budget_min && p.budget_max) return `${fmt(p.budget_min)} - ${fmt(p.budget_max)}`;
        return p.budget_min ? `From ${fmt(p.budget_min)}` : `Up to ${fmt(p.budget_max!)}`;
    }

    return (
        <>
            <TopNav />
            <main className="max-w-5xl mx-auto px-4 py-8">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Freelance Marketplace</h1>
                        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                            Same profiles, same reputation. Flat 7% take rate. No bidding wars.
                        </p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mb-6">
                    {(["browse", "my_contracts", "post"] as const).map(t => (
                        <button key={t} onClick={() => setTab(t)}
                            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                            style={{
                                backgroundColor: tab === t ? "var(--cyan-15)" : "transparent",
                                color: tab === t ? "var(--cyan)" : "var(--text-muted)",
                                border: `1px solid ${tab === t ? "var(--cyan-30)" : "transparent"}`,
                            }}>
                            {t === "browse" ? "Browse Projects" : t === "my_contracts" ? "My Contracts" : "Post a Project"}
                        </button>
                    ))}
                </div>

                {/* Browse */}
                {tab === "browse" && (
                    <div className="space-y-3">
                        {loading ? (
                            <div className="text-center py-10" style={{ color: "var(--text-muted)" }}>Loading projects...</div>
                        ) : projects.length === 0 ? (
                            <div className="rounded-xl p-8 text-center" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                                <p className="text-sm" style={{ color: "var(--text-muted)" }}>No open projects yet. Be the first to post one!</p>
                            </div>
                        ) : projects.map(p => (
                            <div key={p.id} className="rounded-xl p-5" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                                <div className="flex items-start justify-between">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{p.title}</h3>
                                        <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{p.description}</p>
                                    </div>
                                    <div className="text-right shrink-0 ml-4">
                                        <span className="text-sm font-bold" style={{ color: "var(--cyan)" }}>{formatBudget(p)}</span>
                                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{p.budget_type}</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {p.required_skills.map(skill => (
                                        <span key={skill} className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)" }}>{skill}</span>
                                    ))}
                                </div>
                                <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                                    <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                                        <span>By {p.client_name}</span>
                                        {p.client_build_score && <BuildScore score={p.client_build_score} size="sm" />}
                                        <span>{p.experience_level} level</span>
                                        {p.duration_days && <span>{p.duration_days} days</span>}
                                        <span>{p.applicant_count} applicants</span>
                                    </div>
                                    {user && (
                                        <button onClick={() => handleApply(p.id)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: "var(--cyan)", color: "var(--text-inverse)" }}>
                                            Apply
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* My Contracts */}
                {tab === "my_contracts" && (
                    <div className="space-y-3">
                        {contracts.length === 0 ? (
                            <div className="rounded-xl p-8 text-center" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                                <p className="text-sm" style={{ color: "var(--text-muted)" }}>No contracts yet.</p>
                            </div>
                        ) : contracts.map(c => (
                            <div key={c.id} className="rounded-xl p-5" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{c.project_title}</h3>
                                    <span className="text-xs px-2 py-1 rounded" style={{
                                        backgroundColor: c.status === "active" ? "var(--cyan-15)" : "var(--bg-elevated)",
                                        color: c.status === "active" ? "var(--cyan)" : "var(--text-muted)",
                                    }}>{c.status}</span>
                                </div>
                                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                    ${c.rate_amount.toLocaleString()} {c.rate_type}
                                </p>
                                {c.milestones && c.milestones.length > 0 && (
                                    <div className="mt-3 space-y-1">
                                        {c.milestones.map(m => (
                                            <div key={m.id} className="flex items-center justify-between text-xs py-1">
                                                <span style={{ color: "var(--text-secondary)" }}>{m.title}</span>
                                                <div className="flex items-center gap-2">
                                                    <span style={{ color: "var(--text-muted)" }}>${m.amount.toLocaleString()}</span>
                                                    <span className="px-1.5 py-0.5 rounded text-[10px]" style={{
                                                        backgroundColor: m.status === "paid" ? "var(--cyan-15)" : "var(--bg-elevated)",
                                                        color: m.status === "paid" ? "var(--cyan)" : "var(--text-muted)",
                                                    }}>{m.status}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Post a Project */}
                {tab === "post" && (
                    <div className="rounded-xl p-6 space-y-4" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                        <input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Project title"
                            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                            style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                        <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Describe your project in detail..." rows={5}
                            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-y"
                            style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                        <div className="grid md:grid-cols-3 gap-3">
                            <input value={formData.budget_min} onChange={e => setFormData({ ...formData, budget_min: e.target.value })} type="number" placeholder="Budget min ($)"
                                className="px-3 py-2.5 rounded-lg text-sm outline-none"
                                style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                            <input value={formData.budget_max} onChange={e => setFormData({ ...formData, budget_max: e.target.value })} type="number" placeholder="Budget max ($)"
                                className="px-3 py-2.5 rounded-lg text-sm outline-none"
                                style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                            <select value={formData.experience_level} onChange={e => setFormData({ ...formData, experience_level: e.target.value })}
                                className="px-3 py-2.5 rounded-lg text-sm outline-none"
                                style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}>
                                <option value="junior">Junior</option>
                                <option value="mid">Mid-level</option>
                                <option value="senior">Senior</option>
                                <option value="expert">Expert</option>
                            </select>
                        </div>
                        <input value={formData.required_skills} onChange={e => setFormData({ ...formData, required_skills: e.target.value })} placeholder="Required skills (comma separated)"
                            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                            style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                        <button onClick={handlePost} disabled={posting || !formData.title.trim()}
                            className="w-full py-2.5 rounded-lg text-sm font-medium"
                            style={{ backgroundColor: "var(--cyan)", color: "var(--text-inverse)", opacity: posting ? 0.6 : 1 }}>
                            {posting ? "Posting..." : "Post Project"}
                        </button>
                    </div>
                )}
            </main>
        </>
    );
}
