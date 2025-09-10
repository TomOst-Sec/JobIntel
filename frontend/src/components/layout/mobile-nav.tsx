"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const seekerTabs = [
  {
    href: "/seeker",
    label: "Home",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M3 10l7-7 7 7M5 8.5V16a1 1 0 001 1h3v-4h2v4h3a1 1 0 001-1V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/seeker/chat",
    label: "Search",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/dashboard/radar",
    label: "Radar",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="10" cy="10" r="5" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="10" cy="10" r="2" stroke="currentColor" strokeWidth="1.3" />
        <path d="M10 2v8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/seeker/alerts",
    label: "Alerts",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M10 2a6 6 0 016 6c0 3.5 1.5 5.5 2 6H2c.5-.5 2-2.5 2-6a6 6 0 016-6zM8.5 16.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/dashboard/settings",
    label: "Profile",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 18c0-3.5 3.1-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

const recruiterTabs = [
  {
    href: "/recruiter/dashboard",
    label: "Dashboard",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M3 10l7-7 7 7M5 8.5V16a1 1 0 001 1h3v-4h2v4h3a1 1 0 001-1V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/recruiter/search",
    label: "Search",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/recruiter/pipeline",
    label: "Pipeline",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="5" height="16" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="7.5" y="5" width="5" height="13" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="13" y="8" width="5" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    href: "/recruiter/outreach",
    label: "Outreach",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M2 5l8 5 8-5M2 5v10a1 1 0 001 1h14a1 1 0 001-1V5M2 5a1 1 0 011-1h14a1 1 0 011 1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/dashboard/settings",
    label: "Profile",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 18c0-3.5 3.1-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function MobileNav() {
  const pathname = usePathname();

  // Auto-detect mode from pathname
  const isRecruiter = pathname.startsWith("/recruiter");
  const tabs = isRecruiter ? recruiterTabs : seekerTabs;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden glass"
      style={{
        borderTop: "1px solid var(--border-subtle)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const isActive = isRecruiter
            ? tab.href === "/recruiter/dashboard"
              ? pathname === "/recruiter/dashboard"
              : pathname.startsWith(tab.href)
            : tab.href === "/seeker"
              ? pathname === "/seeker"
              : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors duration-200 relative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]"
              style={{
                color: isActive ? "var(--cyan)" : "var(--text-muted)",
              }}
              aria-current={isActive ? "page" : undefined}
            >
              {/* Active indicator */}
              {isActive && (
                <span
                  className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                  style={{ backgroundColor: "var(--cyan)" }}
                  aria-hidden="true"
                />
              )}
              {tab.icon}
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default MobileNav;
