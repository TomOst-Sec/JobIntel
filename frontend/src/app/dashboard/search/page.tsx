"use client";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ChatContainer } from "@/components/chat/chat-container";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SearchPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  if (loading || !user) return null;

  return (
    <DashboardShell>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>AI Search</h1>
      <ChatContainer />
    </DashboardShell>
  );
}
