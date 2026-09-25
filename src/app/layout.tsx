import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppHeader } from "@/components/app-header";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { I18nProvider } from "@/i18n/provider";
import { getLocale, getTranslator } from "@/i18n/server";
import {
  APPLE_ICON_SIZES,
  FAVICON_SIZES,
  STARTUP_DEVICES,
  THEME_COLOR,
  appleIconPath,
  faviconPath,
  startupImagePath,
  startupMedia,
} from "@/lib/pwa-assets";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return {
    title: t("app.name"),
    description: t("app.description"),
    applicationName: t("app.name"),
    icons: {
      icon: FAVICON_SIZES.map((size) => ({ url: faviconPath(size), sizes: `${size}x${size}`, type: "image/png" })),
      apple: APPLE_ICON_SIZES.map((size) => ({ url: appleIconPath(size), sizes: `${size}x${size}` })),
    },
    appleWebApp: {
      capable: true,
      title: "Bigos",
      statusBarStyle: "default",
      startupImage: STARTUP_DEVICES.map((device) => ({ url: startupImagePath(device), media: startupMedia(device) })),
    },
  };
}

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  width: "device-width",
  initialScale: 1,
  // Lets the installed app draw under the notch; padding uses env(safe-area-inset-*).
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background font-sans">
        <I18nProvider locale={locale}>
          <AppHeader />
          <main className="mx-auto w-full max-w-6xl flex-1 px-[max(1rem,env(safe-area-inset-left))] pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] sm:pt-8">
            {children}
          </main>
          <ServiceWorkerRegister />
        </I18nProvider>
      </body>
    </html>
  );
}
