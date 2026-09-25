"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/generate", label: "Gerar" },
  { href: "/edit", label: "Editar" },
];

export function AppHeader() {
  const pathname = usePathname();
  return (
    <header className="border-b bg-background pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-[max(1rem,env(safe-area-inset-left))]">
        <Link href="/generate" className="flex h-10 items-center gap-2 font-semibold">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static icon */}
          <img src="/icons/icon-192.png" alt="" width={28} height={28} className="rounded-md" />
          Bigos Image
        </Link>
        <nav className="flex gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex h-10 items-center rounded-md px-3 text-sm font-medium sm:h-8 text-muted-foreground transition-colors hover:text-foreground",
                pathname.startsWith(link.href) && "bg-muted text-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
