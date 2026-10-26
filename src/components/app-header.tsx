"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EffectsIcon, GenerateIcon, MusicIcon, RestoreIcon, VideoIcon } from "@/components/icons";
import { JobsMenu } from "@/components/jobs-menu";
import { SettingsMenu } from "@/components/settings-menu";
import { useI18n } from "@/i18n/provider";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/image", label: "nav.image", Icon: GenerateIcon },
  { href: "/video", label: "nav.video", Icon: VideoIcon },
  { href: "/music", label: "nav.music", Icon: MusicIcon },
  { href: "/effects", label: "nav.effects", Icon: EffectsIcon },
  { href: "/restore", label: "nav.restore", Icon: RestoreIcon },
] as const;

export function AppHeader({ theme }: { theme: Theme }) {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <header className="border-b bg-background pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 sm:gap-6 px-[max(1rem,env(safe-area-inset-left))]">
        <Link href="/image" aria-label={t("app.name")} className="flex h-10 shrink-0 items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static icon */}
          <img src="/icons/icon-192.png" alt="" width={34} height={34} className="rounded-[10px]" />
          {/* One line, and only where it fits beside the tabs: with icon-only tabs (560–767 px) and next to the named tabs from 1024 px. */}
          <span className="hidden font-heading text-lg leading-tight font-bold tracking-tight whitespace-nowrap min-[560px]:inline md:hidden lg:inline">
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
                aria-label={t(label)}
                title={t(label)}
                className={cn(
                  "flex h-10 items-center gap-2 rounded-lg px-2 text-sm sm:px-3 font-medium text-muted-foreground transition-colors hover:text-foreground md:h-9",
                  active && "bg-secondary text-foreground",
                )}
              >
                <Icon className={cn(active && "text-primary")} />
                {/* Five tabs and the jobs button don't fit with their names below md: icons only (spec §14, decisions 31 and 33). */}
                <span className="hidden md:inline">{t(label)}</span>
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <JobsMenu />
          <SettingsMenu initialTheme={theme} />
        </div>
      </div>
    </header>
  );
}
