import { EffectsScreen } from "@/components/effects-screen";
import { ServiceStatus } from "@/components/service-status";
import { getTranslator } from "@/i18n/server";
import { getConfig } from "@/lib/config";
import { screenLimits } from "@/lib/screen-limits";

// Limits come from the server's environment at request time.
export const dynamic = "force-dynamic";

export default async function EffectsPage({ searchParams }: PageProps<"/effects">) {
  const job = (await searchParams).job;
  const jobId = typeof job === "string" ? job : null;
  const { t } = await getTranslator();
  const limits = screenLimits();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">{t("effects.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("effects.subtitle")}</p>
      </div>
      <ServiceStatus wakeSeconds={getConfig().comfyWakeMs / 1000} />
      <EffectsScreen key={jobId ?? "new"} limits={limits} jobId={jobId} />
    </div>
  );
}
