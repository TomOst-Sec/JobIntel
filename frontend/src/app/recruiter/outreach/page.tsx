"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";

interface OutreachMessage {
  outreach_id: string;
  candidate_id: string;
  subject: string | null;
  body: string;
  sequence_number: number;
  channel: string;
  tone: string;
  status: string;
  created_at: string | null;
}

interface OutreachStats {
  total: number;
  drafts: number;
  sent: number;
  opened: number;
  replied: number;
  open_rate: number;
  reply_rate: number;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  draft: { bg: "var(--bg-elevated)", fg: "var(--text-muted)" },
  sent: { bg: "var(--cyan-15)", fg: "var(--cyan)" },
  opened: { bg: "var(--gold-15)", fg: "var(--gold)" },
  replied: { bg: "var(--green-15)", fg: "var(--green)" },
};

const CHANNEL_COLORS: Record<string, string> = {
  email: "var(--cyan)",
  linkedin: "#0A66C2",
  inmail: "var(--purple)",
};

function OutreachCard({
  message, onSend,
}: {
  message: OutreachMessage;
  onSend: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusStyle = STATUS_COLORS[message.status] || STATUS_COLORS.draft;

  return (
    <div
      className="rounded-xl p-4 transition-all duration-200"
      style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: statusStyle.bg, color: statusStyle.fg }}
            >
              {message.status}
            </span>
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "var(--bg-elevated)", color: CHANNEL_COLORS[message.channel] || "var(--text-muted)" }}
            >
              {message.channel}
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Seq {message.sequence_number}/3
            </span>
          </div>
          {message.subject && (
            <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
              {message.subject}
            </p>
          )}
          <p
            className={`text-xs mt-1 leading-relaxed ${expanded ? "" : "line-clamp-2"}`}
            style={{ color: "var(--text-secondary)" }}
          >
            {message.body}
          </p>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] mt-1"
            style={{ color: "var(--cyan)" }}
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {message.created_at && (
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              {new Date(message.created_at).toLocaleDateString()}
            </span>
          )}
          {message.status === "draft" && (
            <button
              type="button"
              onClick={() => onSend(message.outreach_id)}
              className="text-[11px] px-3 py-1 rounded-lg font-medium transition-colors"
              style={{ backgroundColor: "var(--cyan)", color: "var(--text-inverse)" }}
            >
              Mark Sent
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RecruiterOutreachPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<OutreachMessage[]>([]);
  const [stats, setStats] = useState<OutreachStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"drafts" | "sent" | "analytics">("drafts");

  useEffect(() => {
    if (!authLoading && (!user || (user.role !== "recruiter" && user.role !== "admin"))) {
      router.push("/seeker");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    Promise.all([
      api.get<OutreachMessage[]>("/recruiter/outreach").catch(() => []),
      api.get<OutreachStats>("/recruiter/outreach/stats").catch(() => null),
    ]).then(([msgs, s]) => {
      setMessages(msgs as OutreachMessage[]);
      if (s) setStats(s as OutreachStats);
      setLoading(false);
    });
  }, []);

  const handleSend = async (outreachId: string) => {
    try {
      await api.put(`/recruiter/outreach/${outreachId}/status`, { status: "sent" });
      setMessages((prev) =>
        prev.map((m) => m.outreach_id === outreachId ? { ...m, status: "sent" } : m)
      );
    } catch { /* ignore */ }
  };

  const drafts = messages.filter((m) => m.status === "draft");
  const sent = messages.filter((m) => m.status !== "draft");

  if (authLoading || loading) return null;

  return (
    <div style={{ backgroundColor: "var(--bg-deep)", minHeight: "100vh" }}>
      <TopNav showSearch={false} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="text-lg font-semibold mb-6" style={{ color: "var(--text-primary)" }}>
          Outreach
        </h1>

        {/* Stats row */}
        {stats && (
          <div className="flex flex-wrap gap-4 mb-6">
            {[
              { label: "Total Messages", value: stats.total, color: "var(--text-primary)" },
              { label: "Drafts", value: stats.drafts, color: "var(--text-muted)" },
              { label: "Sent", value: stats.sent, color: "var(--cyan)" },
              { label: "Open Rate", value: `${stats.open_rate}%`, color: "var(--gold)" },
              { label: "Reply Rate", value: `${stats.reply_rate}%`, color: "var(--green)" },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="rounded-xl px-4 py-3"
                style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
              >
                <p className="text-xl font-bold" style={{ color, fontFeatureSettings: "'tnum'" }}>
                  {value}
                </p>
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6">
          {([
            { key: "drafts" as const, label: "Drafts", count: drafts.length },
            { key: "sent" as const, label: "Sent", count: sent.length },
            { key: "analytics" as const, label: "Analytics", count: null },
          ]).map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: activeTab === key ? "var(--cyan-15)" : "transparent",
                color: activeTab === key ? "var(--cyan)" : "var(--text-secondary)",
              }}
            >
              {label}
              {count !== null && (
                <span
                  className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)" }}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="space-y-3">
          {activeTab === "drafts" && (
            <>
              {drafts.length > 0 ? (
                drafts.map((msg) => (
                  <OutreachCard key={msg.outreach_id} message={msg} onSend={handleSend} />
                ))
              ) : (
                <div
                  className="rounded-xl p-8 text-center"
                  style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                >
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    No drafts. Generate outreach from the{" "}
                    <a href="/recruiter/search" style={{ color: "var(--cyan)" }}>Search page</a>.
                  </p>
                </div>
              )}
            </>
          )}

          {activeTab === "sent" && (
            <>
              {sent.length > 0 ? (
                sent.map((msg) => (
                  <OutreachCard key={msg.outreach_id} message={msg} onSend={handleSend} />
                ))
              ) : (
                <div
                  className="rounded-xl p-8 text-center"
                  style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                >
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    No sent messages yet.
                  </p>
                </div>
              )}
            </>
          )}

          {activeTab === "analytics" && (
            <div
              className="rounded-xl p-6"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            >
              <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                Performance by Channel
              </h3>
              {stats && stats.total > 0 ? (
                <div className="space-y-4">
                  {["email", "linkedin", "inmail"].map((channel) => {
                    const channelMsgs = messages.filter((m) => m.channel === channel);
                    const channelSent = channelMsgs.filter((m) => m.status !== "draft").length;
                    const channelReplied = channelMsgs.filter((m) => m.status === "replied").length;
                    const replyRate = channelSent > 0 ? Math.round((channelReplied / channelSent) * 100) : 0;

                    return (
                      <div key={channel} className="flex items-center gap-3">
                        <span
                          className="text-xs w-16 font-medium capitalize"
                          style={{ color: CHANNEL_COLORS[channel] || "var(--text-muted)" }}
                        >
                          {channel}
                        </span>
                        <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: "var(--bg-elevated)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${replyRate}%`,
                              backgroundColor: CHANNEL_COLORS[channel] || "var(--text-muted)",
                              minWidth: replyRate > 0 ? "4px" : "0",
                            }}
                          />
                        </div>
                        <span className="text-xs w-12 text-right" style={{ color: "var(--text-muted)", fontFeatureSettings: "'tnum'" }}>
                          {replyRate}% ({channelMsgs.length})
                        </span>
                      </div>
                    );
                  })}

                  <div className="pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                      Performance by Tone
                    </h3>
                    {["professional", "casual", "technical"].map((tone) => {
                      const toneMsgs = messages.filter((m) => m.tone === tone);
                      const toneSent = toneMsgs.filter((m) => m.status !== "draft").length;
                      const toneReplied = toneMsgs.filter((m) => m.status === "replied").length;
                      const replyRate = toneSent > 0 ? Math.round((toneReplied / toneSent) * 100) : 0;

                      return (
                        <div key={tone} className="flex items-center gap-3 mb-2">
                          <span className="text-xs w-16 capitalize" style={{ color: "var(--text-secondary)" }}>
                            {tone}
                          </span>
                          <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: "var(--bg-elevated)" }}>
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${replyRate}%`,
                                backgroundColor: "var(--purple)",
                                minWidth: replyRate > 0 ? "4px" : "0",
                              }}
                            />
                          </div>
                          <span className="text-xs w-12 text-right" style={{ color: "var(--text-muted)", fontFeatureSettings: "'tnum'" }}>
                            {replyRate}% ({toneMsgs.length})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Send some messages to see analytics here.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <MobileNav />
    </div>
  );
}
