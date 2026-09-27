// Music spikes (spec §14, decision 30): MiniMax Music 3 — time, output format, Portuguese lyrics,
// instrumental, duration. Usage: node --env-file=.env scripts/spikes/m6-music.ts [name-filter]
// Writes MP3s and report.json to storage/spikes/m6/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ComfyClient } from "../../src/lib/comfy/client.ts";
import { runPrompt } from "../../src/lib/comfy/run.ts";
import { getConfig } from "../../src/lib/config.ts";
import { mp3Duration } from "../../src/lib/audio.ts";
import { type ApiGraph, findNodeId } from "../../src/lib/workflow/graph.ts";

type Case = { name: string; caption?: string; lyrics?: string; seconds: number };

const SAMBA = `Global Metadata: Brazilian samba, upbeat and festive. 100 BPM, G major. Joyful weekend celebration mood, sunny afternoon at a street party. Warm, lively acoustic production.

Vocal Details: Warm male lead vocal singing in Brazilian Portuguese, clear diction, joyful delivery, with a small group answering the chorus.

Arrangement: Cavaquinho strumming the harmony, seven-string guitar bass runs, pandeiro, surdo and tamborim groove, hand claps in the chorus. Intro: cavaquinho alone, then the percussion enters. Verses: voice over cavaquinho and pandeiro. Chorus: full percussion and group vocals. Outro: percussion fades out.`;
const SAMBA_LYRICS = `[Intro]

[Verse]
Chegou o sábado, o sol abriu
A turma toda já se reuniu
Tem cavaquinho, tem pandeiro e tem amor
E a tristeza foi embora sem dizer pra onde for

[Chorus]
Ô, ô, ô, deixa o samba me levar
Ô, ô, ô, fim de semana é pra sambar

[Outro]`;
const CALM = `Global Metadata: Calm solo piano, ambient, 70 BPM, C major. Peaceful and reflective. Soft intimate production with room reverb.

Arrangement: Solo piano playing gentle arpeggios and a simple melody. No vocals. Intro: sparse notes. Middle: the melody develops. Outro: slows down and fades.`;

const cases: Case[] = [
  { name: "original-60s", seconds: 60 },
  { name: "pt-samba-60s", caption: SAMBA, lyrics: SAMBA_LYRICS, seconds: 60 },
  { name: "instrumental-empty-30s", caption: CALM, lyrics: "", seconds: 30 },
  { name: "instrumental-tag-30s", caption: CALM, lyrics: "[Instrumental]", seconds: 30 },
];

const filter = process.argv[2];
const selected = filter ? cases.filter((c) => c.name.includes(filter)) : cases;
const config = getConfig();
const outDir = path.resolve(config.storageDir, "spikes", "m6");
mkdirSync(outDir, { recursive: true });
const client = new ComfyClient({ baseUrl: config.comfyUrl, clientId: `bigos-spike-${Date.now()}`, timeoutMs: 120_000 });

const report: Record<string, unknown>[] = [];
for (const c of selected) {
  const graph = JSON.parse(readFileSync("workflows/api/audio_minimax_music_3.json", "utf8")) as ApiGraph;
  const music = graph[findNodeId(graph, "@music")].inputs;
  if (c.caption !== undefined) music.caption = c.caption;
  if (c.lyrics !== undefined) music.lyrics = c.lyrics;
  music.max_duration = c.seconds;
  graph[findNodeId(graph, "@seed")].inputs.seed = 42;
  const t0 = Date.now();
  process.stdout.write(`${c.name} `);
  try {
    const { entry } = await runPrompt(client, graph, {
      timeoutMs: 30 * 60_000,
      onProgress: (p) => process.stdout.write(p.phase === "running" ? "." : "w"),
    });
    const seconds = (Date.now() - t0) / 1000;
    const out = (entry.outputs ?? {})[findNodeId(graph, "@save")] as Record<string, unknown>;
    const key = Object.keys(out ?? {})[0];
    const file = (out[key] as { filename: string; subfolder: string; type: string }[])[0];
    const mp3 = await client.view(file);
    writeFileSync(path.join(outDir, `${c.name}.mp3`), mp3);
    const row = { name: c.name, seconds, keys: Object.keys(out), output: file, bytes: mp3.length, durationSec: mp3Duration(mp3) };
    console.log(` ${seconds.toFixed(0)}s`, JSON.stringify(row));
    report.push(row);
  } catch (err) {
    console.log(" FAILED", err instanceof Error ? err.message : err, (err as { details?: unknown }).details ?? "");
    report.push({ name: c.name, error: String(err) });
  }
}
writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
