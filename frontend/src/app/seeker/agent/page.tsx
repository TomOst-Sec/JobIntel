"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TopNav } from "@/components/layout/top-nav";

interface AgentDashboard {
    config: {
        is_active: number;
        agent_mode: string;
        target_roles: string[];
        min_salary: number | null;
        remote_preference: string;
        alert_frequency: string;
        alert_min_match_score: number;
        total_matches_found: number;
        total_alerts_sent: number;
        last_scan_at: string | null;
    };
    stats: {
        total_matches: number;
        presented: number;
        interested: number;
        applied: number;
        avg_confidence: number;
        best_match: number;
    };
    recent_matches: {
        id: number;
        job_id: number;
        title: string;
        company: string;
        location: string;
        salary_min: number;
        salary_max: number;
        match_confidence: number;
        candidate_overall: number;
        job_overall: number;
        match_explanation: string;
        status: string;
    }[];
    activity: { action_type: string; details: any; created_at: string }[];
}

export default function AIAgentPage() {
    const { user } = useAuth();
    const [dashboard, setDashboard] = useState<AgentDashboard | null>(null);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [configEdit, setConfigEdit] = useState(false);
    const [editRoles, setEditRoles] = useState("");
    const [editSalary, setEditSalary] = useState("");
    const [editRemote, setEditRemote] = useState("any");
    const [saving, setSaving] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);

    useEffect(() => { loadDashboard(); }, []);

    async function loadDashboard() {
        try {
            const data = await api.get<AgentDashboard>("/agent/dashboard");
            setDashboard(data);
            if (data.config) {
                setEditRoles((data.config.target_roles || []).join(", "));
                setEditSalary(data.config.min_salary?.toString() || "");
                setEditRemote(data.config.remote_preference || "any");
            }
        } catch { } finally { setLoading(false); }
    }

    async function handleScan() {
        setScanning(true);
        setScanError(null);
        try {
            await api.post("/agent/scan");
            await loadDashboard();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Scan failed";
            if (msg.toLowerCase().includes("api key") || msg.toLowerCase().includes("provider") || msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("internal server")) {
                setScanError("AI scan requires an API key. Please connect your AI provider in Settings > AI Provider first.");
            } else {
                setScanError(msg);
            }
        } finally { setScanning(false); }
    }

    async function handleSaveConfig() {
        setSaving(true);
        try {
            await api.put("/agent/config", {
                target_roles: editRoles.split(",").map(s => s.trim()).filter(Boolean),
                min_salary: editSalary ? parseInt(editSalary) : null,
                remote_preference: editRemote,
            });
            setConfigEdit(false);
            await loadDashboard();
        } finally { setSaving(false); }
    }

    async function handleRespond(matchId: number, response: string) {
        await api.post(`/agent/matches/${matchId}/respond`, { response });
        await loadDashboard();
    }

    async function toggleAgent() {
        if (!dashboard) return;
        await api.put("/agent/config", { is_active: !dashboard.config.is_active });
        await loadDashboard();
    }

    function formatSalary(min: number, max: number) {
        if (!min && !max) return "Not disclosed";
        const fmt = (n: number) => n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`;
        if (min && max) return `${fmt(min)} - ${fmt(max)}`;
        return min ? `${fmt(min)}+` : `Up to ${fmt(max)}`;
    }

    if (loading) return <><TopNav /><div className="max-w-4xl mx-auto px-4 py-20 text-center" style={{ color: "var(--text-muted)" }}>Loading agent...</div></>;

    const config = dashboard?.config;
    const stats = dashboard?.stats;
    const matches = dashboard?.recent_matches || [];

    return (
        <>
            <TopNav />
            <main className="max-w-5xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                            AI Agent
                        </h1>
                        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                            Your personal AI monitors the market 24/7 and finds the best opportunities for you.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={toggleAgent}
                            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                            style={{
                                backgroundColor: config?.is_active ? "var(--cyan-15)" : "var(--bg-elevated)",
                                color: config?.is_active ? "var(--cyan)" : "var(--text-muted)",
                                border: `1px solid ${config?.is_active ? "var(--cyan-30)" : "var(--border-subtle)"}`,
                            }}
                        >
                            {config?.is_active ? "Agent Active" : "Agent Paused"}
                        </button>
                        <button
                            onClick={handleScan}
                            disabled={scanning}
                            className="px-4 py-2 rounded-lg text-sm font-medium"
                            style={{ backgroundColor: "var(--cyan)", color: "var(--text-inverse)", opacity: scanning ? 0.6 : 1 }}
                        >
                            {scanning ? "Scanning..." : "Scan Now"}
                        </button>
                    </div>
                </div>

                {/* Scan Error */}
                {scanError && (
                    <div
                        className="rounded-xl p-4 mb-6 flex items-start gap-3"
                        style={{ backgroundColor: "var(--red-08, rgba(239,68,68,0.08))", border: "1px solid var(--red-15, rgba(239,68,68,0.15))" }}
                    >
                        <span style={{ color: "var(--red)" }}>&#9888;</span>
                        <div className="flex-1">
                            <p className="text-sm" style={{ color: "var(--red)" }}>{scanError}</p>
                            {scanError.includes("Settings") && (
                                <Link href="/dashboard/settings/ai" className="text-xs font-medium mt-1 inline-block" style={{ color: "var(--cyan)" }}>
                                    Go to AI Settings &rarr;
                                </Link>
                            )}
                        </div>
                        <button onClick={() => setScanError(null)} className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>&times;</button>
                    </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                    {[
                        { label: "Total Matches", value: stats?.total_matches || 0 },
                        { label: "Presented", value: stats?.presented || 0 },
                        { label: "Interested", value: stats?.interested || 0 },
                        { label: "Applied", value: stats?.applied || 0 },
                        { label: "Best Match", value: `${stats?.best_match || 0}%` },
                    ].map((s) => (
                        <div
                            key={s.label}
                            className="rounded-xl p-4 text-center"
                            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                        >
                            <p className="text-2xl font-bold font-mono" style={{ color: "var(--cyan)" }}>{s.value}</p>
                            <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                        </div>
                    ))}
                </div>

                {/* Config + Matches */}
                <div className="grid md:grid-cols-3 gap-6">
                    {/* Config */}
                    <div
                        className="rounded-xl p-5"
                        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Search Parameters</h2>
                            <button
                                onClick={() => setConfigEdit(!configEdit)}
                                className="text-xs"
                                style={{ color: "var(--cyan)" }}
                            >
                                {configEdit ? "Cancel" : "Edit"}
                            </button>
                        </div>
                        {configEdit ? (
                            <div className="space-y-3">
                                <label className="block">
                                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Target Roles (comma separated)</span>
                                    <input value={editRoles} onChange={e => setEditRoles(e.target.value)} placeholder="Senior Backend, Staff Engineer"
                                        className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                                </label>
                                <label className="block">
                                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Minimum Salary</span>
                                    <input value={editSalary} onChange={e => setEditSalary(e.target.value)} type="number" placeholder="120000"
                                        className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                                </label>
                                <label className="block">
                                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Remote Preference</span>
                                    <select value={editRemote} onChange={e => setEditRemote(e.target.value)}
                                        className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}>
                                        <option value="any">Any</option>
                                        <option value="remote_only">Remote Only</option>
                                        <option value="hybrid">Hybrid</option>
                                        <option value="onsite">On-site</option>
                                    </select>
                                </label>
                                <button onClick={handleSaveConfig} disabled={saving}
                                    className="w-full py-2 rounded-lg text-sm font-medium"
                                    style={{ backgroundColor: "var(--cyan)", color: "var(--text-inverse)" }}>
                                    {saving ? "Saving..." : "Save"}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3 text-sm">
                                <div>
                                    <span style={{ color: "var(--text-muted)" }}>Roles: </span>
                                    <span style={{ color: "var(--text-primary)" }}>
                                        {(config?.target_roles || []).length > 0 ? config?.target_roles.join(", ") : "Not set"}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ color: "var(--text-muted)" }}>Min Salary: </span>
                                    <span style={{ color: "var(--text-primary)" }}>{config?.min_salary ? `$${config.min_salary.toLocaleString()}` : "Any"}</span>
                                </div>
                                <div>
                                    <span style={{ color: "var(--text-muted)" }}>Remote: </span>
                                    <span style={{ color: "var(--text-primary)" }}>{config?.remote_preference || "Any"}</span>
                                </div>
                                <div>
                                    <span style={{ color: "var(--text-muted)" }}>Min Match Score: </span>
                                    <span style={{ color: "var(--text-primary)" }}>{config?.alert_min_match_score || 70}%</span>
                                </div>
                                {config?.last_scan_at && (
                                    <div>
                                        <span style={{ color: "var(--text-muted)" }}>Last Scan: </span>
                                        <span style={{ color: "var(--text-primary)" }}>{new Date(config.last_scan_at).toLocaleString()}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Matches */}
                    <div className="md:col-span-2 space-y-3">
                        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                            Top Matches ({matches.length})
                        </h2>
                        {matches.length === 0 ? (
                            <div className="rounded-xl p-8 text-center" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                                    No matches yet. Hit "Scan Now" to find matches, or set your search parameters first.
                                </p>
                            </div>
                        ) : (
                            matches.map((m) => (
                                <div
                                    key={m.id}
                                    className="rounded-xl p-4"
                                    style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <Link href={`/seeker/jobs/${m.job_id}`} className="text-sm font-semibold hover:underline" style={{ color: "var(--text-primary)" }}>
                                                {m.title}
                                            </Link>
                                            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                                                {m.company} {m.location ? `\u00B7 ${m.location}` : ""} {m.salary_min ? `\u00B7 ${formatSalary(m.salary_min, m.salary_max)}` : ""}
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0 ml-4">
                                            <span className="text-lg font-bold font-mono" style={{ color: m.match_confidence >= 80 ? "var(--cyan)" : m.match_confidence >= 60 ? "#FEE440" : "var(--text-muted)" }}>
                                                {Math.round(m.match_confidence)}%
                                            </span>
                                            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>match</p>
                                        </div>
                                    </div>

                                    {/* Bidirectional scores */}
                                    <div className="flex gap-4 mt-2 text-xs">
                                        <span style={{ color: "var(--cyan)" }}>You for Job: {Math.round(m.candidate_overall)}%</span>
                                        <span style={{ color: "#9B5DE5" }}>Job for You: {Math.round(m.job_overall)}%</span>
                                    </div>

                                    {m.match_explanation && (
                                        <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
                                            {m.match_explanation}
                                        </p>
                                    )}

                                    {/* Actions */}
                                    {m.status === "presented" || m.status === "discovered" ? (
                                        <div className="flex gap-2 mt-3">
                                            <button onClick={() => handleRespond(m.id, "interested")}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                                                style={{ backgroundColor: "var(--cyan-15)", color: "var(--cyan)" }}>
                                                Interested
                                            </button>
                                            <button onClick={() => handleRespond(m.id, "apply")}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                                                style={{ backgroundColor: "var(--cyan)", color: "var(--text-inverse)" }}>
                                                Apply
                                            </button>
                                            <button onClick={() => handleRespond(m.id, "not_interested")}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                                                style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
                                                Pass
                                            </button>
                                        </div>
                                    ) : (
                                        <span className="inline-block mt-2 px-2 py-1 rounded text-[10px] font-medium uppercase"
                                            style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                                            {m.status}
                                        </span>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </main>
        </>
    );
}
