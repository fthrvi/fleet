import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { cn } from "@/lib/utils";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Lab Fleet",
  description: "Private compute coordinator for your homelab",
};

const navItems = [
  { href: "/", label: "Fleet" },
  { href: "/apps", label: "Apps" },
  { href: "/run", label: "Run" },
  { href: "/deploy", label: "Deploy" },
  { href: "/jobs", label: "Jobs" },
  { href: "/templates", label: "Templates" },
  { href: "/workflows", label: "Workflows" },
  { href: "/schedules", label: "Schedules" },
  { href: "/health", label: "Health" },
  { href: "/notifications", label: "Notify" },
  { href: "/backups", label: "Backups" },
  { href: "/setup", label: "Add machine" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Apply saved theme before paint to avoid FOUC */}
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body className={cn("min-h-screen bg-background text-foreground")}>
        <Nav items={navItems} />
        <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">{children}</main>
      </body>
    </html>
  );
}
