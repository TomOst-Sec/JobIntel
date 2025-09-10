"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

const recruiterNav = [
  { href: "/dashboard", label: "Overview", icon: "📊" },
  { href: "/dashboard/search", label: "AI Search", icon: "🔍" },
  { href: "/dashboard/signals", label: "Signals", icon: "🚨" },
  { href: "/dashboard/radar", label: "Radar", icon: "📡" },
  { href: "/dashboard/companies", label: "Companies", icon: "🏢" },
  { href: "/dashboard/reports", label: "Reports", icon: "📄" },
  { href: "/dashboard/admin", label: "Admin", icon: "🛠️" },
  { href: "/dashboard/admin/scrapers", label: "Scrapers", icon: "🤖" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
];

const seekerNav = [
  { href: "/seeker", label: "Overview", icon: "📊" },
  { href: "/seeker/chat", label: "Career Chat", icon: "💬" },
  { href: "/seeker/roadmap", label: "Roadmap", icon: "🗺️" },
  { href: "/seeker/negotiate", label: "Negotiate", icon: "💰" },
  { href: "/seeker/alerts", label: "Alerts", icon: "🔔" },
  { href: "/seeker/cv", label: "CV Analysis", icon: "📄" },
  { href: "/seeker/companies", label: "Companies", icon: "🏢" },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const nav = user?.role === "recruiter" ? recruiterNav : seekerNav;

  return (
    <div className="flex h-screen" style={{ backgroundColor: "var(--bg-void)" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ backgroundColor: "rgba(3, 5, 8, 0.7)" }}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — desktop: always visible, mobile: slide drawer */}
      <aside
        className={[
          "flex flex-col shrink-0 z-50",
          // Desktop
          "hidden md:flex",
        ].join(" ")}
        style={{
          width: "264px",
          backgroundColor: "var(--bg-surface)",
          borderRight: "1px solid var(--border-subtle)",
        }}
      >
        <SidebarContent
          nav={nav}
          pathname={pathname}
          user={user}
          logout={logout}
        />
      </aside>

      {/* Mobile sidebar drawer */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 flex flex-col md:hidden",
          "transition-transform duration-300 ease-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        style={{
          width: "280px",
          backgroundColor: "var(--bg-surface)",
          borderRight: "1px solid var(--border-subtle)",
        }}
      >
        <SidebarContent
          nav={nav}
          pathname={pathname}
          user={user}
          logout={logout}
          onNavClick={() => setSidebarOpen(false)}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Mobile top bar */}
        <div
          className="md:hidden flex items-center h-14 px-4 sticky top-0 z-10"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Open navigation"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <Link href="/" className="ml-3 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            Job<span style={{ color: "var(--cyan)" }}>Intel</span>
          </Link>
        </div>

        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}

function SidebarContent({
  nav,
  pathname,
  user,
  logout,
  onNavClick,
}: {
  nav: { href: string; label: string; icon: string }[];
  pathname: string;
  user: { email?: string; plan_name?: string | null } | null;
  logout: () => void;
  onNavClick?: () => void;
}) {
  return (
    <>
      <div className="p-6">
        <Link
          href="/"
          className="text-xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Job<span style={{ color: "var(--cyan)" }}>Intel</span>
        </Link>
      </div>
      <nav className="flex-1 px-3">
        {nav.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" &&
              item.href !== "/seeker" &&
              pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavClick}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm transition-colors"
              style={{
                backgroundColor: isActive ? "var(--cyan-15)" : "transparent",
                color: isActive ? "var(--cyan)" : "var(--text-secondary)",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }
              }}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div
        className="p-4"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <p
          className="text-sm truncate"
          style={{ color: "var(--text-secondary)" }}
        >
          {user?.email}
        </p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {user?.plan_name || "Free"} plan
        </p>
        <button
          onClick={logout}
          className="text-xs mt-2 transition-colors"
          style={{ color: "var(--red)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.8";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          Sign out
        </button>
      </div>
    </>
  );
}
