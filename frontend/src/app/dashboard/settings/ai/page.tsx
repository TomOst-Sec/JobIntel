"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TopNav } from "@/components/layout/top-nav";

interface Provider {
    id: string;
    label: string;
    models: Record<string, string>;
}

interface ConnectedProvider {
    provider: string;
    label: string;
    model_preference: string | null;
    is_active: number;
    usage_tokens_total: number;
    last_used_at: string | null;
}

export default function BYOKSettingsPage() {
    const { user } = useAuth();
    const [providers, setProviders] = useState<Provider[]>([]);
    const [connected, setConnected] = useState<ConnectedProvider[]>([]);
    const [loading, setLoading] = useState(true);

    // Connect form state
    const [selectedProvider, setSelectedProvider] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [modelPref, setModelPref] = useState("");
    const [connecting, setConnecting] = useState(false);
    const [connectError, setConnectError] = useState("");
    const [connectSuccess, setConnectSuccess] = useState("");

    // Test state
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; response?: string; error?: string } | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        try {
            const [availRes, connRes] = await Promise.all([
                api.get<{ providers: Provider[] }>("/ai/providers"),
                api.get<{ providers: ConnectedProvider[] }>("/ai/connected"),
            ]);
            setProviders(availRes.providers);
            setConnected(connRes.providers);
        } catch {
            // Not logged in or error
        } finally {
            setLoading(false);
        }
    }

    async function handleConnect() {
        if (!selectedProvider || !apiKey.trim()) return;
        setConnecting(true);
        setConnectError("");
        setConnectSuccess("");
        try {
            await api.post("/ai/connect", {
                provider: selectedProvider,
                api_key: apiKey.trim(),
                model_preference: modelPref || null,
            });
            setConnectSuccess(`Connected ${selectedProvider} successfully!`);
            setApiKey("");
            setModelPref("");
            loadData();
        } catch (e: any) {
            setConnectError(e.message || "Failed to connect");
        } finally {
            setConnecting(false);
        }
    }

    async function handleDisconnect(provider: string) {
        if (!confirm(`Disconnect ${provider}? The platform will fall back to free models.`)) return;
        await api.delete(`/ai/disconnect/${provider}`);
        loadData();
    }

    async function handleTest() {
        setTesting(true);
        setTestResult(null);
        try {
            const result = await api.post<typeof testResult>("/ai/test", { prompt: "Say hello in one sentence." });
            setTestResult(result);
        } catch (e: any) {
            setTestResult({ success: false, error: e.message });
        } finally {
            setTesting(false);
        }
    }

    const selectedProviderData = providers.find((p) => p.id === selectedProvider);

    return (
        <>
            <TopNav />
            <main className="max-w-3xl mx-auto px-4 py-8">
                <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
                    AI Provider Settings
                </h1>
                <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
                    Bring Your Own Key (BYOK) — Connect your own AI API key to power all AI features.
                    Your key is encrypted and never shared. When connected, AI features use YOUR key,
                    saving costs for everyone.
                </p>

                {/* Connected Providers */}
                <section className="mb-8">
                    <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                        Connected Providers
                    </h2>
                    {loading ? (
                        <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>
                    ) : connected.length === 0 ? (
                        <div
                            className="rounded-xl p-6 text-center"
                            style={{ backgroundColor: "var(--bg-surface)", border: "1px dashed var(--border-subtle)" }}
                        >
                            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                                No AI providers connected. Connect one below to unlock premium AI features.
                            </p>
                            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                                Without a connected provider, the platform uses free models with limited capability.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {connected.map((cp) => (
                                <div
                                    key={cp.provider}
                                    className="rounded-xl p-4 flex items-center justify-between"
                                    style={{
                                        backgroundColor: "var(--bg-surface)",
                                        border: `1px solid ${cp.is_active ? "var(--cyan-30)" : "var(--border-subtle)"}`,
                                    }}
                                >
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                                                {cp.label}
                                            </span>
                                            <span
                                                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                                                style={{
                                                    backgroundColor: cp.is_active ? "var(--cyan-15)" : "var(--bg-elevated)",
                                                    color: cp.is_active ? "var(--cyan)" : "var(--text-muted)",
                                                }}
                                            >
                                                {cp.is_active ? "Active" : "Inactive"}
                                            </span>
                                        </div>
                                        <div className="flex gap-4 mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                                            {cp.model_preference && <span>Model: {cp.model_preference}</span>}
                                            {cp.usage_tokens_total > 0 && (
                                                <span>{cp.usage_tokens_total.toLocaleString()} tokens used</span>
                                            )}
                                            {cp.last_used_at && (
                                                <span>Last used: {new Date(cp.last_used_at).toLocaleDateString()}</span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDisconnect(cp.provider)}
                                        className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                                        style={{
                                            color: "var(--red)",
                                            border: "1px solid var(--red)",
                                            backgroundColor: "transparent",
                                        }}
                                    >
                                        Disconnect
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Connect New Provider */}
                <section className="mb-8">
                    <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                        Connect a Provider
                    </h2>
                    <div
                        className="rounded-xl p-6 space-y-4"
                        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                    >
                        {/* Provider select */}
                        <div>
                            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                                Provider
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {providers.map((p) => (
                                    <button
                                        key={p.id}
                                        onClick={() => { setSelectedProvider(p.id); setModelPref(""); }}
                                        className="px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-center"
                                        style={{
                                            backgroundColor: selectedProvider === p.id ? "var(--cyan-15)" : "var(--bg-elevated)",
                                            color: selectedProvider === p.id ? "var(--cyan)" : "var(--text-secondary)",
                                            border: `1px solid ${selectedProvider === p.id ? "var(--cyan-30)" : "var(--border-subtle)"}`,
                                        }}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* API Key */}
                        <div>
                            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                                API Key
                            </label>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={selectedProvider === "anthropic" ? "sk-ant-..." : selectedProvider === "openai" ? "sk-..." : "Your API key"}
                                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none font-mono"
                                style={{
                                    backgroundColor: "var(--bg-elevated)",
                                    border: "1px solid var(--border-default)",
                                    color: "var(--text-primary)",
                                }}
                            />
                            <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                                Your key is encrypted at rest and never shared. We only use it to make AI calls on your behalf.
                            </p>
                        </div>

                        {/* Model preference */}
                        {selectedProviderData && (
                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                                    Preferred Model (optional)
                                </label>
                                <select
                                    value={modelPref}
                                    onChange={(e) => setModelPref(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                                    style={{
                                        backgroundColor: "var(--bg-elevated)",
                                        border: "1px solid var(--border-default)",
                                        color: "var(--text-primary)",
                                    }}
                                >
                                    <option value="">Auto (best available)</option>
                                    {Object.entries(selectedProviderData.models).map(([tier, model]) => (
                                        <option key={model} value={model}>
                                            {tier}: {model}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {connectError && (
                            <div className="text-sm p-3 rounded-lg" style={{ backgroundColor: "var(--red-10, rgba(239,68,68,0.1))", color: "var(--red)" }}>
                                {connectError}
                            </div>
                        )}
                        {connectSuccess && (
                            <div className="text-sm p-3 rounded-lg" style={{ backgroundColor: "var(--cyan-08)", color: "var(--cyan)" }}>
                                {connectSuccess}
                            </div>
                        )}

                        <button
                            onClick={handleConnect}
                            disabled={!selectedProvider || !apiKey.trim() || connecting}
                            className="w-full py-2.5 rounded-lg text-sm font-medium transition-all"
                            style={{
                                backgroundColor: selectedProvider && apiKey.trim() ? "var(--cyan)" : "var(--bg-elevated)",
                                color: selectedProvider && apiKey.trim() ? "var(--text-inverse)" : "var(--text-muted)",
                                opacity: connecting ? 0.6 : 1,
                            }}
                        >
                            {connecting ? "Connecting..." : "Connect Provider"}
                        </button>
                    </div>
                </section>

                {/* Test Connection */}
                <section className="mb-8">
                    <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                        Test Connection
                    </h2>
                    <div
                        className="rounded-xl p-6"
                        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                    >
                        <button
                            onClick={handleTest}
                            disabled={testing}
                            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                            style={{
                                backgroundColor: "var(--cyan-15)",
                                color: "var(--cyan)",
                                border: "1px solid var(--cyan-30)",
                                opacity: testing ? 0.6 : 1,
                            }}
                        >
                            {testing ? "Testing..." : "Send Test Prompt"}
                        </button>
                        {testResult && (
                            <div className="mt-4 p-3 rounded-lg text-sm" style={{
                                backgroundColor: testResult.success ? "var(--cyan-08)" : "var(--red-10, rgba(239,68,68,0.1))",
                                color: testResult.success ? "var(--cyan)" : "var(--red)",
                            }}>
                                {testResult.success ? (
                                    <p>{testResult.response}</p>
                                ) : (
                                    <p>Error: {testResult.error}</p>
                                )}
                            </div>
                        )}
                    </div>
                </section>

                {/* How it works */}
                <section>
                    <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                        How BYOK Works
                    </h2>
                    <div className="grid gap-3">
                        {[
                            { step: "1", title: "Connect your key", desc: "Add your API key from any supported provider (Claude, GPT, Gemini, OpenRouter)" },
                            { step: "2", title: "AI features activate", desc: "All AI-powered features (chat, CV analysis, matching, career advice) use YOUR key" },
                            { step: "3", title: "You control costs", desc: "Pay your provider directly at their rates. No markup from us. Disconnect anytime." },
                            { step: "4", title: "Fallback included", desc: "Without a key, the platform uses free models with limited capability. Core features always work." },
                        ].map((item) => (
                            <div
                                key={item.step}
                                className="rounded-lg p-4 flex gap-4"
                                style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                            >
                                <span
                                    className="text-lg font-bold shrink-0 w-8 h-8 flex items-center justify-center rounded-full"
                                    style={{ backgroundColor: "var(--cyan-15)", color: "var(--cyan)" }}
                                >
                                    {item.step}
                                </span>
                                <div>
                                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{item.title}</p>
                                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
        </>
    );
}
