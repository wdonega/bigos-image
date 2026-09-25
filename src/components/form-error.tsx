import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ApiError } from "@/lib/client/api";

export function FormError({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>{error.message}</AlertTitle>
      {error.details.length > 0 && (
        <AlertDescription>
          <ul className="list-disc pl-4">
            {error.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </AlertDescription>
      )}
    </Alert>
  );
}
