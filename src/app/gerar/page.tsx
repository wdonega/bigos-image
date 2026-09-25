"use client";

import { useState } from "react";

type View =
  | { status: "queued" | "waiting"; ahead: number | null }
  | { status: "running"; progress: number | null }
  | { status: "done"; imageUrl: string; width: number; height: number }
  | { status: "failed"; error: { message: string } }
  | { status: "cancelled" };

// Marco 1: bare page to exercise the backend end to end. Replaced by the full screen in Marco 2.
export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setView(null);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ screen: "generate", prompt, size: { ratio: "1:1", megapixels: 1 } }),
    });
    const body = await res.json();
    if (!res.ok) return setError(body.error.message);
    const events = new EventSource(`/api/jobs/${body.job_id}/events`);
    events.onmessage = (e) => {
      const next = JSON.parse(e.data) as View;
      setView(next);
      if (["done", "failed", "cancelled"].includes(next.status)) events.close();
    };
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Gerar</h1>
      <textarea
        className="min-h-28 rounded border p-2"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Descreva a imagem"
      />
      <button className="rounded bg-black px-4 py-2 text-white" onClick={generate} disabled={!prompt.trim()}>
        Gerar
      </button>
      {error && <p className="text-red-600">{error}</p>}
      {view && <p>{view.status}</p>}
      {view?.status === "done" && <img src={view.imageUrl} alt="Imagem gerada" />}
    </main>
  );
}
