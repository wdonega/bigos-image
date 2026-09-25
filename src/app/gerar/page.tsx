import { GenerateScreen } from "@/components/generate-screen";
import { screenLimits } from "@/lib/screen-limits";

// Limits come from the server's environment at request time.
export const dynamic = "force-dynamic";

export default function GeneratePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gerar imagem</h1>
        <p className="text-sm text-muted-foreground">Descreva o que você quer ver e escolha o tamanho.</p>
      </div>
      <GenerateScreen limits={screenLimits()} />
    </div>
  );
}
