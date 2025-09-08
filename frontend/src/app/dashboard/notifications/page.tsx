"use client";

import { useEffect, useState } from "react";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

interface Notification {
  id: number;
  notification_type: string;
  priority: string;
  title: string;
  body: string;
  action_url: string | null;
  action_label: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

const priorityStyle: Record<string, { color: string; bg: string; label: string }> = {
  critical: { color: "var(--red)", bg: "var(--red-08)", label: "CRITICAL" },
  high: { color: "var(--gold)", bg: "var(--gold-08)", label: "HIGH" },
  medium: { color: "var(--cyan)", bg: "var(--cyan-08)", label: "MEDIUM" },
  low: { color: "var(--text-muted)", bg: "var(--bg-elevated)", label: "LOW" },
};

const typeIcons: Record<string, string> = {
  skynet_opportunity: "briefcase",
  timing_window: "clock",
  salary_intelligence: "dollar",
  career_alert: "trending-up",
  ghost_warning: "alert",
  interview_reminder: "calendar",
  quest_complete: "trophy",
  level_up: "star",
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    loadNotifications();
  }, [filter]);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ notifications: Notification[] }>(
        `/career/notifications?unread_only=${filter === "unread"}&limit=100`,
      );
      setNotifications(res.notifications);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id: number) => {
    try {
      await api.put(`/career/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
      );
    } catch {
      // silent
    }
  };

  const markAllRead = async () => {
    try {
      await api.put("/career/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    } catch {
      // silent
    }
  };

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-deep)" }}>
      <TopNav />
      <main className="max-w-3xl mx-auto px-4 pt-6 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display tracking-tight" style={{ color: "var(--text-primary)" }}>
              Notifications
            </h1>
            {unreadCount > 0 && (
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                {unreadCount} unread
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Filter */}
            <div
              className="flex rounded-lg p-0.5"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            >
              {(["all", "unread"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className="px-3 py-1 text-xs font-semibold rounded-md transition-colors"
                  style={{
                    background: filter === f ? "var(--cyan-15)" : "transparent",
                    color: filter === f ? "var(--cyan)" : "var(--text-muted)",
                  }}
                >
                  {f === "all" ? "All" : "Unread"}
                </button>
              ))}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: "var(--cyan)", background: "var(--cyan-08)" }}
              >
                Mark all read
              </button>
            )}
          </div>
        </div>

        {/* Notifications list */}
        {loading ? (
          <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div
            className="text-center py-16 rounded-xl"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
          >
            <p className="text-lg mb-2" style={{ color: "var(--text-secondary)" }}>
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </p>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Career alerts and updates will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const ps = priorityStyle[n.priority] || priorityStyle.medium;
              const isUnread = !n.read_at;
              return (
                <div
                  key={n.id}
                  className="rounded-xl p-4 transition-all duration-200 cursor-pointer"
                  style={{
                    background: isUnread ? "var(--bg-surface)" : "var(--bg-deep)",
                    border: `1px solid ${isUnread ? "var(--border-default)" : "var(--border-subtle)"}`,
                    opacity: isUnread ? 1 : 0.7,
                  }}
                  onClick={() => !n.read_at && markRead(n.id)}
                >
                  <div className="flex items-start gap-3">
                    {/* Unread dot */}
                    {isUnread && (
                      <div
                        className="w-2 h-2 rounded-full mt-2 shrink-0"
                        style={{ background: "var(--cyan)" }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                          style={{ color: ps.color, background: ps.bg }}
                        >
                          {ps.label}
                        </span>
                        <span
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{ color: "var(--text-muted)", background: "var(--bg-elevated)" }}
                        >
                          {n.notification_type.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>
                          {new Date(n.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <h3
                        className="text-sm font-medium mb-1"
                        style={{ color: isUnread ? "var(--text-primary)" : "var(--text-secondary)" }}
                      >
                        {n.title}
                      </h3>
                      <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                        {n.body}
                      </p>
                      {n.action_url && (
                        <a
                          href={n.action_url}
                          className="inline-block mt-2 text-xs font-medium"
                          style={{ color: "var(--cyan)" }}
                        >
                          {n.action_label || "View details"} &rarr;
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
      <MobileNav />
    </div>
  );
}
