"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

interface TopNavProps {
  showSearch?: boolean;
}

const seekerLinks = [
  { href: "/seeker", label: "Jobs" },
  { href: "/seeker/agent", label: "AI Agent" },
  { href: "/feed", label: "Feed" },
  { href: "/freelance", label: "Freelance" },
  { href: "/seeker/reviews", label: "Reviews" },
  { href: "/startups", label: "Startups" },
];

const recruiterLinks = [
  { href: "/recruiter/dashboard", label: "Dashboard" },
  { href: "/recruiter/search", label: "Search" },
  { href: "/recruiter/pipeline", label: "Pipeline" },
  { href: "/recruiter/outreach", label: "Outreach" },
  { href: "/feed", label: "Feed" },
];

const searchPlaceholders = [
  "Search jobs, companies, skills...",
  "Try: 'Senior React Developer in NYC'",
  "Try: 'Remote Python roles $150K+'",
  "Try: 'Companies scaling in fintech'",
  "Try: 'Ghost job check for Stripe'",
];

export function TopNav({ showSearch = true }: TopNavProps) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Auto-detect mode from pathname
  const mode = pathname.startsWith("/recruiter") ? "recruiter" : "seeker";
  const navLinks = mode === "recruiter" ? recruiterLinks : seekerLinks;

  // Rotate placeholder text
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % searchPlaceholders.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const [modeError, setModeError] = useState<string | null>(null);

  const handleModeSwitch = (newMode: "seeker" | "recruiter") => {
    setModeError(null);
    if (newMode === "recruiter") {
      if (user && (user.role === "recruiter" || user.role === "admin")) {
        router.push("/recruiter/dashboard");
      } else {
        setModeError("Recruiter portal is available for recruiter accounts. You can change your account type during signup.");
        setTimeout(() => setModeError(null), 4000);
      }
    } else {
      router.push("/seeker");
    }
  };

  return (
    <>
      <header
        className="sticky top-0 z-50 glass"
        style={{
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            {/* Logo */}
            <Link
              href="/"
              className="font-display text-xl tracking-tight shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]"
              style={{ color: "var(--text-primary)" }}
            >
              NEX
              <span style={{ color: "var(--cyan)" }}>US</span>
            </Link>

            {/* Search - center on desktop */}
            {showSearch && (
              <div className="hidden md:flex flex-1 max-w-lg mx-auto relative">
                <div
                  className="w-full relative"
                  style={{
                    backgroundColor: searchFocused ? "var(--bg-elevated)" : "var(--bg-surface)",
                    borderRadius: "10px",
                    border: `1px solid ${searchFocused ? "var(--border-strong)" : "var(--border-subtle)"}`,
                    transition: "all 0.2s ease",
                  }}
                >
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <input
                    type="search"
                    placeholder={searchPlaceholders[placeholderIdx]}
                    className="w-full bg-transparent pl-10 pr-16 py-2 text-sm outline-none"
                    style={{ color: "var(--text-primary)" }}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    aria-label="Search jobs, companies, and skills"
                  />
                  <kbd
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: "var(--bg-void)",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    {"\u2318"}K
                  </kbd>
                </div>
              </div>
            )}

            {/* Desktop nav links */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                const isActive =
                  pathname === link.href || pathname.startsWith(link.href + "/");
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]"
                    style={{
                      color: isActive ? "var(--cyan)" : "var(--text-secondary)",
                      backgroundColor: isActive ? "var(--cyan-08)" : "transparent",
                    }}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            {/* Mode toggle */}
            <div
              className="hidden lg:flex items-center rounded-full p-0.5"
              style={{
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
              }}
              role="radiogroup"
              aria-label="User mode"
            >
              <button
                type="button"
                onClick={() => handleModeSwitch("seeker")}
                className="px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]"
                style={{
                  backgroundColor: mode === "seeker" ? "var(--cyan-15)" : "transparent",
                  color: mode === "seeker" ? "var(--cyan)" : "var(--text-muted)",
                }}
                role="radio"
                aria-checked={mode === "seeker"}
              >
                JOB SEEKER
              </button>
              <button
                type="button"
                onClick={() => handleModeSwitch("recruiter")}
                className="px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]"
                style={{
                  backgroundColor: mode === "recruiter" ? "var(--cyan-15)" : "transparent",
                  color: mode === "recruiter" ? "var(--cyan)" : "var(--text-muted)",
                }}
                role="radio"
                aria-checked={mode === "recruiter"}
              >
                RECRUITER
              </button>
            </div>

            {/* Auth area */}
            <div className="hidden md:flex items-center gap-2 ml-2">
              {user ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]"
                    style={{
                      backgroundColor: "var(--cyan-15)",
                      color: "var(--cyan)",
                    }}
                    aria-expanded={userMenuOpen}
                    aria-haspopup="true"
                    aria-label="User menu"
                  >
                    {user.full_name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
                  </button>

                  {userMenuOpen && (
                    <div
                      className="absolute right-0 mt-2 w-56 rounded-lg py-1 z-50 animate-fade-up"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        border: "1px solid var(--border-default)",
                        boxShadow: "var(--shadow-card)",
                      }}
                      role="menu"
                    >
                      <div
                        className="px-3 py-2 border-b"
                        style={{ borderColor: "var(--border-subtle)" }}
                      >
                        <p
                          className="text-sm font-medium truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {user.full_name}
                        </p>
                        <p
                          className="text-xs truncate"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {user.email}
                        </p>
                        <p
                          className="text-[10px] mt-1 font-mono"
                          style={{ color: "var(--cyan)" }}
                        >
                          {user.plan_name || "Free"} Plan
                        </p>
                      </div>
                      <Link
                        href="/profile/me"
                        className="block px-3 py-2 text-sm transition-colors duration-150"
                        style={{ color: "var(--text-secondary)" }}
                        role="menuitem"
                      >
                        My Profile
                      </Link>
                      <Link
                        href="/dashboard/inbox"
                        className="block px-3 py-2 text-sm transition-colors duration-150"
                        style={{ color: "var(--text-secondary)" }}
                        role="menuitem"
                      >
                        📨 Inbox
                      </Link>
                      <Link
                        href="/dashboard/settings/ai"
                        className="block px-3 py-2 text-sm transition-colors duration-150"
                        style={{ color: "var(--text-secondary)" }}
                        role="menuitem"
                      >
                        AI Provider (BYOK)
                      </Link>
                      <Link
                        href="/dashboard/settings"
                        className="block px-3 py-2 text-sm transition-colors duration-150"
                        style={{ color: "var(--text-secondary)" }}
                        role="menuitem"
                      >
                        Settings
                      </Link>
                      <button
                        type="button"
                        onClick={logout}
                        className="w-full text-left px-3 py-2 text-sm transition-colors duration-150"
                        style={{ color: "var(--red)" }}
                        role="menuitem"
                      >
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/signup"
                    className="px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 btn-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]"
                    style={{
                      backgroundColor: "var(--cyan)",
                      color: "var(--text-inverse)",
                    }}
                  >
                    Try Free
                  </Link>
                </>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              type="button"
              className="md:hidden ml-auto p-2 rounded-lg transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]"
              style={{ color: "var(--text-secondary)" }}
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-expanded={mobileOpen}
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : (
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mode switch error toast */}
      {modeError && (
        <div
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-4 py-3 rounded-lg text-sm max-w-sm text-center animate-fade-up"
          style={{
            backgroundColor: "var(--bg-elevated)",
            border: "1px solid var(--gold, #EAB308)",
            color: "var(--gold, #EAB308)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          {modeError}
        </div>
      )}

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden animate-fade-up"
          style={{ backgroundColor: "rgba(3, 5, 8, 0.95)" }}
        >
          <div className="pt-20 px-6 space-y-2">
            {/* Mobile search */}
            {showSearch && (
              <div
                className="mb-4 rounded-lg"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <input
                  type="search"
                  placeholder="Search..."
                  className="w-full bg-transparent px-4 py-3 text-sm outline-none"
                  style={{ color: "var(--text-primary)" }}
                  aria-label="Search"
                />
              </div>
            )}

            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block px-4 py-3 rounded-lg text-base font-medium transition-colors duration-200"
                  style={{
                    color: isActive ? "var(--cyan)" : "var(--text-primary)",
                    backgroundColor: isActive ? "var(--cyan-08)" : "transparent",
                  }}
                >
                  {link.label}
                </Link>
              );
            })}

            {/* Mobile mode toggle */}
            <div
              className="flex rounded-full p-0.5 mt-4"
              style={{
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <button
                type="button"
                onClick={() => handleModeSwitch("seeker")}
                className="flex-1 px-3 py-2 rounded-full text-xs font-semibold tracking-wide text-center transition-all"
                style={{
                  backgroundColor: mode === "seeker" ? "var(--cyan-15)" : "transparent",
                  color: mode === "seeker" ? "var(--cyan)" : "var(--text-muted)",
                }}
              >
                JOB SEEKER
              </button>
              <button
                type="button"
                onClick={() => handleModeSwitch("recruiter")}
                className="flex-1 px-3 py-2 rounded-full text-xs font-semibold tracking-wide text-center transition-all"
                style={{
                  backgroundColor: mode === "recruiter" ? "var(--cyan-15)" : "transparent",
                  color: mode === "recruiter" ? "var(--cyan)" : "var(--text-muted)",
                }}
              >
                RECRUITER
              </button>
            </div>

            <div
              className="pt-4 mt-4 space-y-2"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              {user ? (
                <>
                  <div className="px-4 py-2">
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {user.full_name}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {user.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={logout}
                    className="block w-full text-left px-4 py-3 rounded-lg text-base"
                    style={{ color: "var(--red)" }}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="block px-4 py-3 rounded-lg text-base"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/signup"
                    className="block px-4 py-3 rounded-lg text-base font-medium text-center"
                    style={{
                      backgroundColor: "var(--cyan)",
                      color: "var(--text-inverse)",
                    }}
                  >
                    Try Free
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TopNav;
