"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TopNav } from "@/components/layout/top-nav";

interface ReviewSummary {
    total_reviews: number;
    avg_rating: number | null;
    engineering_culture: number | null;
    management_quality: number | null;
    compensation_fairness: number | null;
    work_life_balance: number | null;
    growth_trajectory: number | null;
    interview_quality: number | null;
}

interface Review {
    id: number;
    company_name: string;
    author_name: string;
    employment_role: string;
    is_current_employee: number;
    overall_rating: number;
    title: string;
    pros: string;
    cons: string;
    advice_to_management: string;
    employer_response: string | null;
    helpful_count: number;
    created_at: string;
}

export default function CompanyReviewsPage() {
    const { user } = useAuth();
    const [searchCompany, setSearchCompany] = useState("");
    const [activeCompany, setActiveCompany] = useState("");
    const [summary, setSummary] = useState<ReviewSummary | null>(null);
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(false);

    // Write review form
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        title: "", pros: "", cons: "", advice_to_management: "",
        employment_role: "", is_current_employee: false,
        engineering_culture: 0, management_quality: 0,
        compensation_fairness: 0, work_life_balance: 0,
        growth_trajectory: 0, interview_quality: 0,
    });
    const [submitting, setSubmitting] = useState(false);

    async function searchReviews() {
        if (!searchCompany.trim()) return;
        setLoading(true);
        setActiveCompany(searchCompany.trim());
        try {
            const [summaryRes, reviewsRes] = await Promise.all([
                api.get<ReviewSummary>(`/reviews/company/${encodeURIComponent(searchCompany.trim())}/summary`),
                api.get<{ reviews: Review[] }>(`/reviews/company/${encodeURIComponent(searchCompany.trim())}`),
            ]);
            setSummary(summaryRes);
            setReviews(reviewsRes.reviews);
        } catch {
            setSummary(null);
            setReviews([]);
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmitReview() {
        if (!formData.title.trim()) return;
        setSubmitting(true);
        try {
            await api.post("/reviews", {
                company_name: activeCompany,
                ...formData,
                engineering_culture: formData.engineering_culture || null,
                management_quality: formData.management_quality || null,
                compensation_fairness: formData.compensation_fairness || null,
                work_life_balance: formData.work_life_balance || null,
                growth_trajectory: formData.growth_trajectory || null,
                interview_quality: formData.interview_quality || null,
            });
            setShowForm(false);
            setFormData({ title: "", pros: "", cons: "", advice_to_management: "", employment_role: "", is_current_employee: false, engineering_culture: 0, management_quality: 0, compensation_fairness: 0, work_life_balance: 0, growth_trajectory: 0, interview_quality: 0 });
            searchReviews();
        } catch { } finally { setSubmitting(false); }
    }

    async function handleVote(reviewId: number, voteType: string) {
        await api.post(`/reviews/${reviewId}/vote`, { vote_type: voteType });
    }

    function StarInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
        return (
            <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
                <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(s => (
                        <button key={s} onClick={() => onChange(s)}
                            className="text-lg transition-transform hover:scale-110"
                            style={{ color: s <= value ? "#FEE440" : "var(--border-subtle)" }}>
                            {s <= value ? "\u2605" : "\u2606"}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    function RatingBar({ label, value }: { label: string; value: number | null }) {
        if (value == null) return null;
        return (
            <div className="flex items-center gap-3">
                <span className="text-xs w-32 shrink-0" style={{ color: "var(--text-muted)" }}>{label}</span>
                <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: "var(--bg-elevated)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(value / 5) * 100}%`, backgroundColor: value >= 4 ? "var(--cyan)" : value >= 3 ? "#FEE440" : "var(--red)" }} />
                </div>
                <span className="text-xs font-mono w-6 text-right" style={{ color: "var(--text-secondary)" }}>{value.toFixed(1)}</span>
            </div>
        );
    }

    return (
        <>
            <TopNav />
            <main className="max-w-4xl mx-auto px-4 py-8">
                <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
                    Company Reviews
                </h1>
                <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
                    Verified, attributed-but-protected reviews. Employers can respond but cannot remove reviews.
                </p>

                {/* Search */}
                <div className="flex gap-2 mb-8">
                    <input
                        value={searchCompany}
                        onChange={(e) => setSearchCompany(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && searchReviews()}
                        placeholder="Search company (e.g. Google, Stripe, Netflix)"
                        className="flex-1 px-4 py-2.5 rounded-lg text-sm outline-none"
                        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    />
                    <button onClick={searchReviews}
                        className="px-6 py-2.5 rounded-lg text-sm font-medium"
                        style={{ backgroundColor: "var(--cyan)", color: "var(--text-inverse)" }}>
                        Search
                    </button>
                </div>

                {loading && <div className="text-center py-10" style={{ color: "var(--text-muted)" }}>Loading reviews...</div>}

                {/* Results */}
                {activeCompany && !loading && (
                    <>
                        {/* Summary */}
                        <div className="rounded-xl p-6 mb-6" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{activeCompany}</h2>
                                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{summary?.total_reviews || 0} verified reviews</p>
                                </div>
                                {summary?.avg_rating && (
                                    <div className="text-center">
                                        <span className="text-3xl font-bold font-mono" style={{ color: "var(--cyan)" }}>{summary.avg_rating.toFixed(1)}</span>
                                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>/ 5.0</p>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                <RatingBar label="Engineering Culture" value={summary?.engineering_culture ?? null} />
                                <RatingBar label="Management Quality" value={summary?.management_quality ?? null} />
                                <RatingBar label="Compensation" value={summary?.compensation_fairness ?? null} />
                                <RatingBar label="Work-Life Balance" value={summary?.work_life_balance ?? null} />
                                <RatingBar label="Growth Trajectory" value={summary?.growth_trajectory ?? null} />
                                <RatingBar label="Interview Quality" value={summary?.interview_quality ?? null} />
                            </div>
                        </div>

                        {/* Write review button */}
                        {user && (
                            <button onClick={() => setShowForm(!showForm)}
                                className="mb-6 px-4 py-2 rounded-lg text-sm font-medium"
                                style={{ backgroundColor: "var(--cyan-15)", color: "var(--cyan)", border: "1px solid var(--cyan-30)" }}>
                                {showForm ? "Cancel" : "Write a Review"}
                            </button>
                        )}

                        {/* Write form */}
                        {showForm && (
                            <div className="rounded-xl p-6 mb-6 space-y-4" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--cyan-30)" }}>
                                <input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Review title"
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                                <div className="grid md:grid-cols-2 gap-3">
                                    <input value={formData.employment_role} onChange={e => setFormData({ ...formData, employment_role: e.target.value })} placeholder="Your role (e.g. Senior Engineer)"
                                        className="px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                                    <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                                        <input type="checkbox" checked={formData.is_current_employee} onChange={e => setFormData({ ...formData, is_current_employee: e.target.checked })} />
                                        Currently work here
                                    </label>
                                </div>
                                <div className="space-y-2">
                                    <StarInput label="Engineering Culture" value={formData.engineering_culture} onChange={v => setFormData({ ...formData, engineering_culture: v })} />
                                    <StarInput label="Management Quality" value={formData.management_quality} onChange={v => setFormData({ ...formData, management_quality: v })} />
                                    <StarInput label="Compensation Fairness" value={formData.compensation_fairness} onChange={v => setFormData({ ...formData, compensation_fairness: v })} />
                                    <StarInput label="Work-Life Balance" value={formData.work_life_balance} onChange={v => setFormData({ ...formData, work_life_balance: v })} />
                                    <StarInput label="Growth Trajectory" value={formData.growth_trajectory} onChange={v => setFormData({ ...formData, growth_trajectory: v })} />
                                    <StarInput label="Interview Quality" value={formData.interview_quality} onChange={v => setFormData({ ...formData, interview_quality: v })} />
                                </div>
                                <textarea value={formData.pros} onChange={e => setFormData({ ...formData, pros: e.target.value })} placeholder="Pros — What's great about working here?" rows={3}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
                                    style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                                <textarea value={formData.cons} onChange={e => setFormData({ ...formData, cons: e.target.value })} placeholder="Cons — What could be improved?" rows={3}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
                                    style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                                <button onClick={handleSubmitReview} disabled={submitting || !formData.title.trim()}
                                    className="px-6 py-2 rounded-lg text-sm font-medium"
                                    style={{ backgroundColor: "var(--cyan)", color: "var(--text-inverse)", opacity: submitting ? 0.6 : 1 }}>
                                    {submitting ? "Submitting..." : "Submit Review"}
                                </button>
                            </div>
                        )}

                        {/* Reviews list */}
                        <div className="space-y-4">
                            {reviews.map(r => (
                                <article key={r.id} className="rounded-xl p-5" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{r.title}</h3>
                                            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                                                {r.employment_role || "Employee"} {r.is_current_employee ? "(Current)" : "(Former)"} &middot; {new Date(r.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <span className="text-lg font-bold font-mono" style={{ color: r.overall_rating >= 4 ? "var(--cyan)" : r.overall_rating >= 3 ? "#FEE440" : "var(--red)" }}>
                                            {r.overall_rating?.toFixed(1)}
                                        </span>
                                    </div>
                                    {r.pros && <div className="mb-2"><p className="text-[10px] font-semibold uppercase mb-0.5" style={{ color: "var(--cyan)" }}>Pros</p><p className="text-sm" style={{ color: "var(--text-secondary)" }}>{r.pros}</p></div>}
                                    {r.cons && <div className="mb-2"><p className="text-[10px] font-semibold uppercase mb-0.5" style={{ color: "var(--red)" }}>Cons</p><p className="text-sm" style={{ color: "var(--text-secondary)" }}>{r.cons}</p></div>}
                                    {r.employer_response && (
                                        <div className="mt-3 p-3 rounded-lg" style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
                                            <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: "#9B5DE5" }}>Employer Response</p>
                                            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{r.employer_response}</p>
                                        </div>
                                    )}
                                    <div className="flex gap-3 mt-3">
                                        <button onClick={() => handleVote(r.id, "helpful")} className="text-xs" style={{ color: "var(--text-muted)" }}>
                                            Helpful ({r.helpful_count})
                                        </button>
                                    </div>
                                </article>
                            ))}
                            {reviews.length === 0 && (
                                <div className="text-center py-8" style={{ color: "var(--text-muted)" }}>
                                    <p className="text-sm">No reviews yet for {activeCompany}. Be the first to review!</p>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </main>
        </>
    );
}
