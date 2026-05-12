"use client";

import Link from "next/link";
import { useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

interface NavItem {
  href: string;
  label: string;
}

interface Props {
  items: NavItem[];
}

export function Nav({ items }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Lab Fleet
          </Link>
        </div>

        {/* Desktop nav */}
        <nav className="hidden flex-1 justify-end gap-1 text-sm md:flex">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground md:hidden"
            aria-label="Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? (
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              ) : (
                <>
                  <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-border md:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3 text-sm">
            {items.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-foreground hover:bg-accent"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
