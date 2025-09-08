"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

/* ── SVG Icons ───────────────────────────────────────────── */

function TargetIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function BuildingIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22V12h6v10" />
      <path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01" />
    </svg>
  );
}

/* ── Password strength ───────────────────────────────────── */

type StrengthLevel = "weak" | "fair" | "good" | "strong";

interface StrengthResult {
  level: StrengthLevel;
  label: string;
  percent: number;
  color: string;
}

function evaluatePasswordStrength(password: string): StrengthResult {
  if (!password) {
    return { level: "weak", label: "", percent: 0, color: "var(--red)" };
  }

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1)
    return { level: "weak", label: "Weak", percent: 25, color: "var(--red)" };
  if (score === 2)
    return { level: "fair", label: "Fair", percent: 50, color: "var(--gold)" };
  if (score === 3)
    return {
      level: "good",
      label: "Good",
      percent: 75,
      color: "var(--green)",
    };
  return {
    level: "strong",
    label: "Strong",
    percent: 100,
    color: "var(--green)",
  };
}

/* ── Page Component ──────────────────────────────────────── */

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"seeker" | "recruiter">("seeker");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const strength = useMemo(
    () => evaluatePasswordStrength(password),
    [password]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(email, password, fullName, role);
      router.push(role === "recruiter" ? "/dashboard" : "/seeker");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
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
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            Create your account
          </p>
        </div>

        {/* Form Card */}
        <form
          onSubmit={handleSubmit}
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
              style={{
                color: "var(--red)",
                background: "var(--red-08)",
              }}
            >
              {error}
            </div>
          )}

          {/* Full Name */}
          <div>
            <label
              htmlFor="signup-name"
              className="block text-sm mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Full Name
            </label>
            <input
              id="signup-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
              placeholder="Jane Doe"
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors duration-200"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = "var(--border-strong)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--border-subtle)")
              }
            />
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="signup-email"
              className="block text-sm mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@company.com"
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors duration-200"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = "var(--border-strong)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--border-subtle)")
              }
            />
          </div>

          {/* Password + Strength */}
          <div>
            <label
              htmlFor="signup-password"
              className="block text-sm mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors duration-200"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = "var(--border-strong)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--border-subtle)")
              }
            />
            {/* Strength indicator bar */}
            {password.length > 0 && (
              <div className="mt-2">
                <div
                  className="h-1 w-full rounded-full overflow-hidden"
                  style={{ background: "var(--bg-elevated)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300 ease-out"
                    style={{
                      width: `${strength.percent}%`,
                      background: strength.color,
                    }}
                  />
                </div>
                <p
                  className="text-xs mt-1 text-right"
                  style={{ color: strength.color }}
                >
                  {strength.label}
                </p>
              </div>
            )}
          </div>

          {/* Role Selector */}
          <div>
            <label
              className="block text-sm mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              I am a...
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Job Seeker */}
              <button
                type="button"
                onClick={() => setRole("seeker")}
                className="relative p-4 rounded-lg text-center transition-all duration-200 cursor-pointer"
                style={{
                  border:
                    role === "seeker"
                      ? "1px solid var(--cyan)"
                      : "1px solid var(--border-subtle)",
                  background:
                    role === "seeker"
                      ? "var(--cyan-15)"
                      : "var(--bg-elevated)",
                  boxShadow:
                    role === "seeker"
                      ? "0 0 20px rgba(0, 212, 255, 0.15)"
                      : "none",
                }}
              >
                <TargetIcon
                  className="w-6 h-6 mx-auto mb-2"
                />
                <span
                  className="text-sm font-medium block"
                  style={{
                    color:
                      role === "seeker"
                        ? "var(--cyan)"
                        : "var(--text-muted)",
                  }}
                >
                  Job Seeker
                </span>
              </button>

              {/* Recruiter */}
              <button
                type="button"
                onClick={() => setRole("recruiter")}
                className="relative p-4 rounded-lg text-center transition-all duration-200 cursor-pointer"
                style={{
                  border:
                    role === "recruiter"
                      ? "1px solid var(--cyan)"
                      : "1px solid var(--border-subtle)",
                  background:
                    role === "recruiter"
                      ? "var(--cyan-15)"
                      : "var(--bg-elevated)",
                  boxShadow:
                    role === "recruiter"
                      ? "0 0 20px rgba(0, 212, 255, 0.15)"
                      : "none",
                }}
              >
                <BuildingIcon
                  className="w-6 h-6 mx-auto mb-2"
                />
                <span
                  className="text-sm font-medium block"
                  style={{
                    color:
                      role === "recruiter"
                        ? "var(--cyan)"
                        : "var(--text-muted)",
                  }}
                >
                  Recruiter
                </span>
              </button>
            </div>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={loading}
            loading={loading}
            className="w-full"
            size="lg"
          >
            {loading ? "Creating account..." : "Create Account"}
          </Button>

          {/* Login link */}
          <p
            className="text-center text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium hover:underline transition-colors"
              style={{ color: "var(--cyan)" }}
            >
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
