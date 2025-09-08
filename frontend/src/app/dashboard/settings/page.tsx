"use client";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Subscription {
  plan_name: string;
  status: string;
  chat_used_today: number;
  chat_limit: number;
}

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sub, setSub] = useState<Subscription | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      fetch("/api/v1/billing/subscription", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json()).then(setSub).catch(() => {});
    }
  }, []);

  if (loading || !user) return null;

  return (
    <DashboardShell>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>Settings</h1>
      <div className="grid gap-6 max-w-2xl">
        <div className="rounded-xl p-6" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Profile</h2>
          <div className="space-y-2 text-sm">
            <p><span style={{ color: "var(--text-secondary)" }}>Name:</span> <span style={{ color: "var(--text-primary)" }}>{user.full_name}</span></p>
            <p><span style={{ color: "var(--text-secondary)" }}>Email:</span> <span style={{ color: "var(--text-primary)" }}>{user.email}</span></p>
            <p><span style={{ color: "var(--text-secondary)" }}>Role:</span> <span className="capitalize" style={{ color: "var(--text-primary)" }}>{user.role}</span></p>
          </div>
        </div>
        {sub && (
          <div className="rounded-xl p-6" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
            <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Subscription</h2>
            <div className="space-y-2 text-sm">
              <p><span style={{ color: "var(--text-secondary)" }}>Plan:</span> <span className="font-medium" style={{ color: "var(--cyan)" }}>{sub.plan_name}</span></p>
              <p><span style={{ color: "var(--text-secondary)" }}>Status:</span> <span style={{ color: "var(--green)" }}>{sub.status}</span></p>
              <p><span style={{ color: "var(--text-secondary)" }}>Chat usage:</span> <span style={{ color: "var(--text-primary)" }}>{sub.chat_used_today} / {sub.chat_limit} today</span></p>
            </div>
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => router.push("/pricing")}>
              Upgrade Plan
            </Button>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
