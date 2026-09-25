import { EditScreen } from "@/components/edit-screen";
import { ServiceStatus } from "@/components/service-status";
import { screenLimits } from "@/lib/screen-limits";

// Limits come from the server's environment at request time.
export const dynamic = "force-dynamic";

export default function EditPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Editar imagem</h1>
        <p className="text-sm text-muted-foreground">Envie uma imagem e diga o que mudar.</p>
      </div>
      <ServiceStatus />
      <EditScreen limits={screenLimits()} />
    </div>
  );
}
