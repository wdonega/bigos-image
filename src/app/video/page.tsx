import { ServiceStatus } from "@/components/service-status";
import { VideoScreen } from "@/components/video-screen";
import { getTranslator } from "@/i18n/server";
import { getConfig } from "@/lib/config";
import { screenLimits } from "@/lib/screen-limits";

// Limits come from the server's environment at request time.
export const dynamic = "force-dynamic";

export default async function VideoPage() {
  const { t } = await getTranslator();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">{t("video.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("video.subtitle")}</p>
      </div>
      <ServiceStatus wakeSeconds={getConfig().comfyWakeMs / 1000} />
      <VideoScreen limits={screenLimits()} />
    </div>
  );
}
