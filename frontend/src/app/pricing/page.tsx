"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Plan {
  id: number;
  name: string;
  price_cents: number;
  chat_limit_daily: number;
  market_limit: number;
  features: string[];
}

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    fetch("/api/v1/billing/plans").then((r) => r.json()).then(setPlans).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-void)" }}>
      <nav
        className="flex items-center justify-between px-8 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <Link href="/" className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          Job<span style={{ color: "var(--cyan)" }}>Intel</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/login"><Button variant="secondary" size="sm">Log in</Button></Link>
          <Link href="/signup"><Button size="sm">Get Started</Button></Link>
        </div>
      </nav>
      <section className="max-w-6xl mx-auto py-20 px-4">
        <h1 className="text-4xl font-bold text-center mb-4" style={{ color: "var(--text-primary)" }}>Simple, transparent pricing</h1>
        <p className="text-center mb-16" style={{ color: "var(--text-secondary)" }}>Start free. Upgrade when you need more.</p>
        <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-6">
          {plans.map((plan) => (
            <div key={plan.id}
              className="rounded-xl p-6 flex flex-col"
              style={{
                backgroundColor: "var(--bg-surface)",
                border: plan.name === "Recruiter" ? "1px solid var(--cyan)" : "1px solid var(--border-subtle)",
                boxShadow: plan.name === "Recruiter" ? "0 0 0 1px var(--cyan)" : "none",
              }}
            >
              {plan.name === "Recruiter" && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full self-start mb-3"
                  style={{ backgroundColor: "var(--cyan)", color: "var(--bg-void)" }}
                >
                  Popular
                </span>
              )}
              <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{plan.name}</h3>
              <p className="text-3xl font-bold mt-2" style={{ color: "var(--text-primary)" }}>
                {plan.price_cents === 0 ? "Free" : `$${plan.price_cents / 100}`}
                {plan.price_cents > 0 && <span className="text-sm font-normal" style={{ color: "var(--text-secondary)" }}>/mo</span>}
              </p>
              <ul className="mt-4 space-y-2 flex-1">
                <li className="text-sm" style={{ color: "var(--text-secondary)" }}>{plan.chat_limit_daily} chats/day</li>
                <li className="text-sm" style={{ color: "var(--text-secondary)" }}>{plan.market_limit >= 99 ? "All" : plan.market_limit} market{plan.market_limit !== 1 ? "s" : ""}</li>
                {plan.features.filter(f => f !== "basic_search").map((f) => (
                  <li key={f} className="text-sm" style={{ color: "var(--text-secondary)" }}>{f.replace(/_/g, " ")}</li>
                ))}
              </ul>
              <Link href="/signup" className="mt-6">
                <Button variant={plan.name === "Recruiter" ? "primary" : "secondary"} className="w-full">
                  {plan.price_cents === 0 ? "Get Started" : "Subscribe"}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
