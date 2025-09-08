import type { Metadata } from "next";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";
import { Providers } from "@/lib/providers";

export const metadata: Metadata = {
  title: "NEXUS — The Operating System for Tech Careers",
  description: "Proof-of-Work profiles, AI-powered bidirectional matching, verified company reviews, freelance marketplace, and startup hub. You are what you BUILD, not what you CLAIM.",
  openGraph: {
    title: "NEXUS — You Are What You Build",
    description: "The platform where skills are PROVEN, salaries are VERIFIED, and AI works for YOU. Not another job board — the career operating system.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
