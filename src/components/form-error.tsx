"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useI18n } from "@/i18n/provider";
import type { ApiError } from "@/lib/client/api";

export function FormError({ error }: { error: ApiError | null }) {
  const { t, detail } = useI18n();
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>{t(`errors.${error.code}`)}</AlertTitle>
      {error.details.length > 0 && (
        <AlertDescription>
          <ul className="list-disc pl-4">
            {error.details.map((d) => (
              <li key={d.code}>{detail("details", d)}</li>
            ))}
          </ul>
        </AlertDescription>
      )}
    </Alert>
  );
}
