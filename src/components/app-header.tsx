"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GenerateIcon, MusicIcon, VideoIcon } from "@/components/icons";
import { SettingsMenu } from "@/components/settings-menu";
import { useI18n } from "@/i18n/provider";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/image", label: "nav.image", Icon: GenerateIcon },
  { href: "/video", label: "nav.video", Icon: VideoIcon },
  { href: "/music", label: "nav.music", Icon: MusicIcon },
] as const;

export function AppHeader({ theme }: { theme: Theme }) {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <header className="border-b bg-background pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 sm:gap-6 px-[max(1rem,env(safe-area-inset-left))]">
        <Link href="/image" aria-label={t("app.name")} className="flex h-10 items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static icon */}
          <img src="/icons/icon-192.png" alt="" width={34} height={34} className="rounded-[10px]" />
          <span className="hidden font-heading text-lg font-bold tracking-tight min-[480px]:inline">
            {t("app.name")}
          </span>
        </Link>
        <nav className="flex gap-1 rounded-xl bg-card p-1">
          {LINKS.map(({ href, label, Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:h-9",
                  active && "bg-secondary text-foreground",
                )}
              >
                <Icon className={cn(active && "text-primary")} />
                {t(label)}
              </Link>
            );
          })}
        </nav>
        <SettingsMenu initialTheme={theme} />
      </div>
    </header>
  );
}
