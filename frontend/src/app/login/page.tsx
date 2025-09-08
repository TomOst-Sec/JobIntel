"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [otpSent, setOtpSent] = useState(false);
  const { login, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.push(redirectTo || "/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "github") => {
    setError("");
    setLoading(true);
    try {
      const res = await api.get<{ url: string }>(`/auth/oauth/${provider}/url`);
      window.location.href = res.url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `${provider} login failed`);
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!phone.trim()) return;
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/oauth/phone/send-otp", { phone_number: phone });
      setOtpSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await api.post<{ access_token: string; refresh_token: string }>(
        "/auth/oauth/phone/verify",
        { phone_number: phone, code: otp },
      );
      localStorage.setItem("token", res.access_token);
      localStorage.setItem("refresh_token", res.refresh_token);
      router.push(redirectTo || "/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-primary)",
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center px-4 py-12 overflow-hidden"
      style={{ background: "var(--bg-deep)" }}
    >
      {/* Ambient glow behind card */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <div
          className="w-[600px] h-[600px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(0, 212, 255, 0.07) 0%, rgba(0, 212, 255, 0.02) 40%, transparent 70%)",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo + Subtitle */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <h1 className="font-display text-3xl tracking-tight">
              <span style={{ color: "var(--text-primary)" }}>JOB</span>
              <span style={{ color: "var(--cyan)" }}>INTEL</span>
            </h1>
          </Link>
          <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            Sign in to your account
          </p>
        </div>

        {/* Form Card */}
        <div
          className="rounded-xl p-8 space-y-5"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          {/* Error */}
          {error && (
            <div
              className="rounded-lg px-4 py-3 text-sm text-center"
              style={{ color: "var(--red)", background: "var(--red-08)" }}
            >
              {error}
            </div>
          )}

          {/* OAuth Buttons */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => handleOAuth("google")}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors duration-200"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
            <button
              type="button"
              onClick={() => handleOAuth("github")}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors duration-200"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
              </svg>
              Continue with GitHub
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>or</span>
            <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
          </div>

          {/* Mode toggle */}
          <div
            className="flex rounded-lg p-0.5"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
          >
            <button
              type="button"
              onClick={() => { setMode("email"); setOtpSent(false); }}
              className="flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors"
              style={{
                background: mode === "email" ? "var(--cyan-15)" : "transparent",
                color: mode === "email" ? "var(--cyan)" : "var(--text-muted)",
              }}
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => setMode("phone")}
              className="flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors"
              style={{
                background: mode === "phone" ? "var(--cyan-15)" : "transparent",
                color: mode === "phone" ? "var(--cyan)" : "var(--text-muted)",
              }}
            >
              Phone
            </button>
          </div>

          {mode === "email" ? (
            <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-sm mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="off"
                  placeholder="you@company.com"
                  className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors duration-200"
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                />
              </div>
              <div>
                <label htmlFor="login-password" className="block text-sm mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="off"
                  placeholder="Enter your password"
                  className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors duration-200"
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                />
              </div>
              <Button type="submit" disabled={loading} loading={loading} className="w-full" size="lg">
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="login-phone" className="block text-sm mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Phone Number
                </label>
                <input
                  id="login-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors duration-200"
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                />
              </div>
              {otpSent && (
                <div>
                  <label htmlFor="login-otp" className="block text-sm mb-1.5" style={{ color: "var(--text-secondary)" }}>
                    Verification Code
                  </label>
                  <input
                    id="login-otp"
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="Enter 6-digit code"
                    maxLength={6}
                    className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors duration-200 tracking-widest text-center font-mono"
                    style={inputStyle}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                  />
                </div>
              )}
              <Button
                type="button"
                disabled={loading}
                loading={loading}
                className="w-full"
                size="lg"
                onClick={otpSent ? handleVerifyOtp : handleSendOtp}
              >
                {loading ? "Please wait..." : otpSent ? "Verify Code" : "Send Verification Code"}
              </Button>
              {otpSent && (
                <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                  Code sent to {phone}. Expires in 10 minutes.
                </p>
              )}
            </div>
          )}

          {/* Sign up link */}
          <p className="text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="font-medium hover:underline transition-colors"
              style={{ color: "var(--cyan)" }}
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
