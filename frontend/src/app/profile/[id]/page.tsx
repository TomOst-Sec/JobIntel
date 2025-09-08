"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TopNav } from "@/components/layout/top-nav";
import { BuildScore } from "@/components/ui/build-score";
import { SkillGraph } from "@/components/ui/skill-graph";

interface Profile {
    user_id: number;
    full_name: string;
    email: string;
    role: string;
    headline: string;
    bio: string;
    avatar_url: string;
    skills: string[];
    experience: { title: string; company: string; from: string; to: string; desc: string }[];
    education: { school: string; degree: string; field: string; year: string }[];
    location: string;
    website: string;
    github_url: string;
    linkedin_url: string;
    is_public: boolean;
    open_to_messages: boolean;
    member_since: string;
}

export default function ProfilePage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const userId = params?.id as string;

    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [isOwn, setIsOwn] = useState(false);

    // Edit state
    const [editing, setEditing] = useState(false);
    const [editData, setEditData] = useState<Partial<Profile>>({});
    const [saving, setSaving] = useState(false);

    // GitHub / Build Score state
    const [githubData, setGithubData] = useState<{
        build_score?: number;
        build_score_breakdown?: { consistency: number; quality: number; breadth: number; collaboration: number; impact: number };
        github_username?: string;
        top_languages?: Record<string, number>;
        skills?: string[];
        public_repos?: number;
        total_stars?: number;
        followers?: number;
    } | null>(null);
    const [syncingGithub, setSyncingGithub] = useState(false);

    useEffect(() => {
        loadProfile();
        loadGithubData();
    }, [userId]);

    async function loadGithubData() {
        try {
            const targetId = userId === "me" ? "me" : userId;
            const endpoint = targetId === "me"
                ? "/profiles/github"
                : `/profiles/${targetId}/build-score`;
            const data = await api.get<typeof githubData>(endpoint);
            setGithubData(data);
        } catch {
            // No GitHub data available — that's fine
        }
    }

    async function handleGithubSync() {
        setSyncingGithub(true);
        try {
            const data = await api.post<typeof githubData>("/profiles/github/sync", {});
            setGithubData(data);
        } catch {
            // GitHub sync failed — user may need to re-link
        } finally {
            setSyncingGithub(false);
        }
    }

    useEffect(() => {
        if (profile && user) {
            setIsOwn(profile.user_id === user.id);
        }
    }, [profile, user]);

    async function loadProfile() {
        setLoading(true);
        try {
            const data = userId === "me"
                ? await api.get<Profile>("/profiles/me")
                : await api.get<Profile>(`/profiles/${userId}`);
            setProfile(data);
            setEditData(data);
        } catch (e: any) {
            setError(e.message || "Failed to load profile");
        } finally {
            setLoading(false);
        }
    }

    async function handleSave() {
        setSaving(true);
        try {
            const updated = await api.put<Profile>("/profiles/me", {
                headline: editData.headline,
                bio: editData.bio,
                location: editData.location,
                website: editData.website,
                github_url: editData.github_url,
                linkedin_url: editData.linkedin_url,
                skills: editData.skills,
                is_public: editData.is_public,
                open_to_messages: editData.open_to_messages,
            });
            setProfile(updated);
            setEditing(false);
        } catch (e: any) {
            setError(e.message || "Failed to save");
        } finally {
            setSaving(false);
        }
    }

    async function startConversation() {
        try {
            const conv = await api.post<{ id: number }>("/messages/conversations", {
                user_id: profile!.user_id,
            });
            router.push(`/dashboard/inbox?conv=${conv.id}`);
        } catch (e: any) {
            setError(e.message || "Failed to start conversation");
        }
    }

    if (loading) {
        return (
            <>
                <TopNav />
                <div className="max-w-4xl mx-auto px-4 py-20 text-center">
                    <div className="animate-pulse" style={{ color: "var(--text-muted)" }}>Loading profile...</div>
                </div>
            </>
        );
    }

    if (error && !profile) {
        return (
            <>
                <TopNav />
                <div className="max-w-4xl mx-auto px-4 py-20 text-center">
                    <p style={{ color: "var(--red)" }}>{error}</p>
                </div>
            </>
        );
    }

    if (!profile) return null;

    return (
        <>
            <TopNav />
            <main className="max-w-4xl mx-auto px-4 py-8">
                {error && (
                    <div className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: "var(--red-10)", color: "var(--red)" }}>
                        {error}
                    </div>
                )}

                {/* Profile Header */}
                <div
                    className="rounded-2xl p-6 mb-6"
                    style={{
                        backgroundColor: "var(--bg-surface)",
                        border: "1px solid var(--border-subtle)",
                    }}
                >
                    <div className="flex items-start gap-6">
                        {/* Avatar */}
                        <div
                            className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold shrink-0"
                            style={{
                                background: "linear-gradient(135deg, var(--cyan-15), var(--purple-15, rgba(139,92,246,0.15)))",
                                color: "var(--cyan)",
                                border: "2px solid var(--cyan-30)",
                            }}
                        >
                            {profile.avatar_url ? (
                                <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                            ) : (
                                profile.full_name?.charAt(0).toUpperCase()
                            )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                                {profile.full_name}
                            </h1>
                            {editing ? (
                                <input
                                    value={editData.headline || ""}
                                    onChange={(e) => setEditData({ ...editData, headline: e.target.value })}
                                    placeholder="Your professional headline"
                                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{
                                        backgroundColor: "var(--bg-elevated)",
                                        border: "1px solid var(--border-default)",
                                        color: "var(--text-primary)",
                                    }}
                                />
                            ) : (
                                <p className="text-base mt-1" style={{ color: "var(--text-secondary)" }}>
                                    {profile.headline || "No headline yet"}
                                </p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                                {profile.location && <span>📍 {profile.location}</span>}
                                <span style={{ color: "var(--cyan)" }}>
                                    {profile.role === "recruiter" ? "🏢 Recruiter" : "💼 Job Seeker"}
                                </span>
                                <span>Member since {new Date(profile.member_since).toLocaleDateString()}</span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 shrink-0">
                            {isOwn ? (
                                editing ? (
                                    <>
                                        <button
                                            onClick={handleSave}
                                            disabled={saving}
                                            className="px-4 py-2 rounded-lg text-sm font-medium"
                                            style={{ backgroundColor: "var(--cyan)", color: "var(--text-inverse)" }}
                                        >
                                            {saving ? "Saving..." : "Save"}
                                        </button>
                                        <button
                                            onClick={() => { setEditing(false); setEditData(profile); }}
                                            className="px-4 py-2 rounded-lg text-sm"
                                            style={{ color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
                                        >
                                            Cancel
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => setEditing(true)}
                                        className="px-4 py-2 rounded-lg text-sm font-medium"
                                        style={{
                                            backgroundColor: "var(--cyan-15)",
                                            color: "var(--cyan)",
                                            border: "1px solid var(--cyan-30)",
                                        }}
                                    >
                                        ✏️ Edit Profile
                                    </button>
                                )
                            ) : (
                                <button
                                    onClick={startConversation}
                                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                                    style={{ backgroundColor: "var(--cyan)", color: "var(--text-inverse)" }}
                                >
                                    💬 Send Message
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Links */}
                    {!editing && (profile.website || profile.github_url || profile.linkedin_url) && (
                        <div className="flex gap-4 mt-4 text-sm">
                            {profile.website && (
                                <a href={profile.website} target="_blank" rel="noopener" style={{ color: "var(--cyan)" }}>
                                    🌐 Website
                                </a>
                            )}
                            {profile.github_url && (
                                <a href={profile.github_url} target="_blank" rel="noopener" style={{ color: "var(--cyan)" }}>
                                    💻 GitHub
                                </a>
                            )}
                            {profile.linkedin_url && (
                                <a href={profile.linkedin_url} target="_blank" rel="noopener" style={{ color: "var(--cyan)" }}>
                                    🔗 LinkedIn
                                </a>
                            )}
                        </div>
                    )}
                </div>

                {/* Edit Links */}
                {editing && (
                    <div
                        className="rounded-2xl p-6 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4"
                        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                    >
                        <h3 className="col-span-full text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>Links & Location</h3>
                        {["location", "website", "github_url", "linkedin_url"].map((field) => (
                            <label key={field} className="block">
                                <span className="text-xs font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>
                                    {field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                                </span>
                                <input
                                    value={(editData as any)[field] || ""}
                                    onChange={(e) => setEditData({ ...editData, [field]: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                                />
                            </label>
                        ))}
                        <label className="flex items-center gap-2 col-span-full">
                            <input
                                type="checkbox"
                                checked={editData.open_to_messages ?? true}
                                onChange={(e) => setEditData({ ...editData, open_to_messages: e.target.checked })}
                            />
                            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Open to receiving messages</span>
                        </label>
                    </div>
                )}

                {/* GitHub Build Score */}
                {githubData?.build_score != null ? (
                    <div
                        className="rounded-2xl p-6 mb-6"
                        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Build Score</h2>
                            {githubData.github_username && (
                                <a
                                    href={`https://github.com/${githubData.github_username}`}
                                    target="_blank"
                                    rel="noopener"
                                    className="text-xs font-mono"
                                    style={{ color: "var(--text-muted)" }}
                                >
                                    @{githubData.github_username}
                                </a>
                            )}
                        </div>
                        <div className="flex items-start gap-6">
                            <BuildScore
                                score={githubData.build_score}
                                breakdown={githubData.build_score_breakdown}
                                size="lg"
                                showBreakdown
                            />
                            <div className="flex-1 space-y-3">
                                {/* Top languages */}
                                {githubData.top_languages && Object.keys(githubData.top_languages).length > 0 && (
                                    <div>
                                        <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>Top Languages</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {Object.keys(githubData.top_languages).slice(0, 6).map((lang) => (
                                                <span
                                                    key={lang}
                                                    className="px-2 py-0.5 rounded text-xs font-medium"
                                                    style={{ backgroundColor: "var(--purple-08, rgba(155,93,229,0.08))", color: "var(--purple, #9B5DE5)" }}
                                                >
                                                    {lang}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {/* Stats row */}
                                <div className="flex gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
                                    {githubData.public_repos != null && <span>{githubData.public_repos} repos</span>}
                                    {githubData.total_stars != null && <span>{githubData.total_stars} stars</span>}
                                    {githubData.followers != null && <span>{githubData.followers} followers</span>}
                                </div>
                            </div>
                        </div>
                        {isOwn && (
                            <button
                                onClick={handleGithubSync}
                                disabled={syncingGithub}
                                className="mt-4 text-xs px-3 py-1.5 rounded-lg transition-colors"
                                style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
                            >
                                {syncingGithub ? "Syncing..." : "Refresh GitHub Data"}
                            </button>
                        )}
                    </div>
                ) : isOwn ? (
                    <div
                        className="rounded-2xl p-6 mb-6 text-center"
                        style={{ backgroundColor: "var(--bg-surface)", border: "1px dashed var(--border-subtle)" }}
                    >
                        <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
                            Connect your GitHub to generate your Build Score
                        </p>
                        <button
                            onClick={handleGithubSync}
                            disabled={syncingGithub}
                            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                            style={{ backgroundColor: "var(--cyan-15)", color: "var(--cyan)", border: "1px solid var(--cyan-30)" }}
                        >
                            {syncingGithub ? "Syncing..." : "Sync GitHub Profile"}
                        </button>
                    </div>
                ) : null}

                {/* Bio */}
                <div
                    className="rounded-2xl p-6 mb-6"
                    style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                >
                    <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary)" }}>About</h2>
                    {editing ? (
                        <textarea
                            value={editData.bio || ""}
                            onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                            placeholder="Tell people about yourself..."
                            rows={5}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
                            style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                        />
                    ) : (
                        <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
                            {profile.bio || "No bio yet."}
                        </p>
                    )}
                </div>

                {/* Skills Graph */}
                <div
                    className="rounded-2xl p-6 mb-6"
                    style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                >
                    <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Skill Graph</h2>
                    {editing ? (
                        <input
                            value={(editData.skills || []).join(", ")}
                            onChange={(e) => setEditData({ ...editData, skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                            placeholder="React, Python, TypeScript..."
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                        />
                    ) : (profile.skills && profile.skills.length > 0) || (githubData?.skills && githubData.skills.length > 0) ? (
                        <SkillGraph skills={profile.skills?.length > 0 ? profile.skills : githubData?.skills || []} topLanguages={githubData?.top_languages} />
                    ) : (
                        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No skills listed yet.</p>
                    )}
                </div>
            </main>
        </>
    );
}
