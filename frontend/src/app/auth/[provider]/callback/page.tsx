"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function OAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const provider = params.provider as string;
  const code = searchParams.get("code");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!code || !provider) {
      setError("Missing OAuth code or provider");
      return;
    }

    const exchange = async () => {
      try {
        const res = await api.post<{ access_token: string; refresh_token: string }>(
          `/auth/oauth/${provider}/callback`,
          { code },
        );
        localStorage.setItem("token", res.access_token);
        localStorage.setItem("refresh_token", res.refresh_token);
        router.push("/dashboard");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Authentication failed");
      }
    };

    exchange();
  }, [code, provider, router]);

  if (error) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--bg-deep)" }}
      >
        <div className="text-center">
          <p className="text-lg mb-4" style={{ color: "var(--red)" }}>
            {error}
          </p>
          <Link
            href="/login"
            className="text-sm font-medium px-6 py-2 rounded-lg"
            style={{ background: "var(--cyan)", color: "var(--text-inverse)" }}
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--bg-deep)" }}
    >
      <div className="text-center">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-4"
          style={{ borderColor: "var(--border-subtle)", borderTopColor: "var(--cyan)" }}
        />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Completing {provider} sign-in...
        </p>
      </div>
    </div>
  );
}
