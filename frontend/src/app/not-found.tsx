import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--bg-void)", color: "var(--text-primary)" }}
    >
      <div className="text-center max-w-md">
        <p
          className="font-mono text-7xl font-bold mb-4"
          style={{ color: "var(--cyan)" }}
        >
          404
        </p>
        <h1 className="font-display text-2xl mb-2">Page Not Found</h1>
        <p
          className="text-sm mb-8"
          style={{ color: "var(--text-secondary)" }}
        >
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/"
            className="px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--cyan)",
              color: "var(--text-inverse)",
            }}
          >
            Go Home
          </Link>
          <Link
            href="/ghost-check"
            className="px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            Ghost Check
          </Link>
        </div>
      </div>
    </div>
  );
}
