"use client";

import { useEffect, useState } from "react";
import { TopNav } from "@/components/layout/top-nav";
import { api } from "@/lib/api";

interface APIKey {
    id: number;
    provider: string;
    last_four: string;
    created_at: string;
    updated_at: string;
}

export default function SettingsKeysPage() {
    const [keys, setKeys] = useState<APIKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [provider, setProvider] = useState("openai");
    const [newKey, setNewKey] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchKeys();
    }, []);

    const fetchKeys = async () => {
        try {
            const data = await api.get("/v1/keys/");
            setKeys(data || []);
        } catch (err: any) {
            setError("Failed to load your API keys.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveKey = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setSaving(true);

        try {
            await api.post("/v1/keys/", {
                provider,
                api_key: newKey,
            });
            setSuccess(`Successfully connected and encrypted your ${provider} key!`);
            setNewKey("");
            fetchKeys();
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to validate or save key.");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteKey = async (providerName: string) => {
        if (!confirm(`Are you sure you want to disconnect your ${providerName} key?`)) return;

        try {
            await api.delete(`/v1/keys/${providerName}`);
            setSuccess(`${providerName} key disconnected.`);
            fetchKeys();
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to disconnect key.");
        }
    };

    return (
        <div className="min-h-screen" style={{ backgroundColor: "var(--bg-black)" }}>
            <TopNav />
            <main className="max-w-4xl mx-auto px-4 py-8 mt-16">
                <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
                    AI Preferences & API Keys
                </h1>
                <p className="mb-8" style={{ color: "var(--text-secondary)" }}>
                    Bring your own keys (BYOK) for a native experience. Your keys are AES-256-GCM encrypted and never leave your isolation boundary.
                </p>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-xl mb-6 text-sm">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="bg-green-500/10 border border-green-500/20 text-green-500 px-4 py-3 rounded-xl mb-6 text-sm">
                        {success}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Add Key Card */}
                    <div
                        className="rounded-2xl p-6"
                        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                    >
                        <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                            Connect Provider
                        </h2>

                        <form onSubmit={handleSaveKey} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Provider</label>
                                <select
                                    value={provider}
                                    onChange={(e) => setProvider(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                                >
                                    <option value="openai">OpenAI (ChatGPT)</option>
                                    <option value="anthropic">Anthropic (Claude)</option>
                                    <option value="google">Google (Gemini)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>API Key</label>
                                <input
                                    type="password"
                                    value={newKey}
                                    onChange={(e) => setNewKey(e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono"
                                    style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={saving || !newKey}
                                className="w-full py-2 px-4 rounded-xl font-medium text-sm transition-opacity"
                                style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-black)", opacity: saving || !newKey ? 0.7 : 1 }}
                            >
                                {saving ? "Validating & Encrypting..." : "Connect Key"}
                            </button>
                        </form>
                    </div>

                    {/* Active Keys Card */}
                    <div
                        className="rounded-2xl p-6"
                        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                    >
                        <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                            Active Keys
                        </h2>

                        {loading ? (
                            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading your keys...</p>
                        ) : keys.length === 0 ? (
                            <div className="text-center py-8">
                                <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>No keys connected.</p>
                                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Connecting a key enables deep repo analysis and custom profile synthesis.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {keys.map(k => (
                                    <div
                                        key={`${k.provider}-${k.updated_at}`}
                                        className="flex items-center justify-between p-4 rounded-xl"
                                        style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
                                    >
                                        <div>
                                            <p className="font-medium capitalize" style={{ color: "var(--text-primary)" }}>{k.provider}</p>
                                            <p className="text-xs font-mono mt-1" style={{ color: "var(--text-secondary)" }}>•••• {k.last_four}</p>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteKey(k.provider)}
                                            className="text-xs font-medium px-3 py-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                                            style={{ border: "1px solid rgba(239, 68, 68, 0.2)" }}
                                        >
                                            Disconnect
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
