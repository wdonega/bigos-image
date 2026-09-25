import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppHeader } from "@/components/app-header";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { I18nProvider } from "@/i18n/provider";
import { getLocale, getTranslator } from "@/i18n/server";
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
    appleWebApp: { capable: true, title: "Bigos", statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  themeColor: "#ffc87c",
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
