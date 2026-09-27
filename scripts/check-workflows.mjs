#!/usr/bin/env node
// Validates the workflows exported in API format (workflows/api/).
// Usage: node scripts/check-workflows.mjs [dir]   (default: workflows/api)
// Exits with code 1 when something required is wrong. Warnings (!) do not fail.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "workflows/api";

const PROMPT = ["prompt", "negative_prompt"];
const LATENT = ["width", "height"];
const SAMPLER = ["seed", "steps", "cfg", "sampler_name", "scheduler"];
const VIDEO = ["prompt", "width", "height", "length"];

// title -> [class_type, inputs the backend writes (must be values, not links)]
const EXPECTED = {
  "t2i_api.json": {
    "@prompt": ["TextEncodeQwenImage21", PROMPT],
    "@latent_size": ["EmptyLatentImage", LATENT],
    "@sampler": ["KSampler", SAMPLER],
    "@save": ["SaveImageAdvanced", []],
  },
  "edit_api.json": {
    "@prompt": ["TextEncodeQwenImage21", [...PROMPT, "resolution"]],
    "@latent_size": ["EmptyLatentImage", LATENT],
    "@sampler": ["KSampler", SAMPLER],
    "@custom_size": ["ComfySwitchNode", ["switch"]],
    "@image_1": ["LoadImage", ["image"]],
    "@save": ["SaveImageAdvanced", []],
  },
  // Video (spec §14, decision 28): the Director node replaced by ComfyUI's native MiniMax H3 nodes.
  "video_fl2va_api.json": {
    "@video": ["MiniMaxH3ImageToVideo", VIDEO],
    "@seed": ["RandomNoise", ["noise_seed"]],
    "@save": ["VHS_VideoCombine", []],
  },
  // Music (spec §14, decision 30): the owner's MiniMax Music 3 export, kept under its own name.
  "audio_minimax_music_3.json": {
    "@music": ["MiniMaxMusic3TextEncode", ["caption", "lyrics", "max_duration"]],
    "@seed": ["SeedNode", ["seed"]],
    "@save": ["SaveAudioAdvanced", []],
  },
  "video_ref2va_api.json": {
    "@video": ["MiniMaxH3ReferenceToVideo", VIDEO],
    "@seed": ["RandomNoise", ["noise_seed"]],
    "@image_1": ["LoadImage", ["image"]],
    "@save": ["VHS_VideoCombine", []],
  },
};

const FORBIDDEN = ["ResolutionSelector", "ImageCompare", "MiniMaxH3DirectorCS"];

let failed = false;
const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
const fail = (m) => {
  failed = true;
  console.log(`  ✗ ${m}`);
};

for (const [file, expected] of Object.entries(EXPECTED)) {
  console.log(`\n${file}`);
  const path = join(dir, file);
  if (!existsSync(path)) {
    fail(`file not found in ${dir}`);
    continue;
  }

  let wf;
  try {
    wf = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    fail(`invalid JSON: ${e.message}`);
    continue;
  }

  if (Array.isArray(wf.nodes) || wf.links) {
    fail("looks like the UI format (has 'nodes'/'links'). Export with Save (API Format).");
    continue;
  }
  const nodes = Object.entries(wf).filter(([, n]) => n && typeof n === "object" && n.class_type);
  if (nodes.length === 0) {
    fail("no node with class_type: not API format");
    continue;
  }
  ok(`${nodes.length} nodes, API format`);

  for (const [id, n] of nodes) {
    if (FORBIDDEN.includes(n.class_type)) {
      fail(`node ${id} (${n.class_type}) must be removed before exporting`);
    }
  }

  const byTitle = {};
  for (const [id, n] of nodes) {
    const t = n._meta?.title;
    if (typeof t === "string" && t.startsWith("@")) (byTitle[t] ??= []).push([id, n]);
  }

  for (const [title, [cls, keys]] of Object.entries(expected)) {
    const found = byTitle[title] ?? [];
    if (found.length !== 1) {
      fail(`${title}: expected 1 node with this title, found ${found.length}`);
      continue;
    }
    const [id, n] = found[0];
    if (n.class_type !== cls) {
      fail(`${title} (node ${id}): class_type is ${n.class_type}, expected ${cls}`);
      continue;
    }
    const problems = [];
    for (const k of keys) {
      if (!(k in (n.inputs ?? {}))) problems.push(`missing input '${k}'`);
      else if (Array.isArray(n.inputs[k])) problems.push(`'${k}' is linked to another node (must be a plain value)`);
    }
    if (problems.length) fail(`${title} (node ${id}): ${problems.join("; ")}`);
    else ok(`${title} → ${cls} (node ${id})`);
  }

  for (const t of Object.keys(byTitle)) {
    if (!(t in expected)) warn(`title ${t} is not part of the convention (ignored)`);
  }

  const loads = nodes.filter(([, n]) => n.class_type === "LoadImage").length;
  if (file === "t2i_api.json" && loads > 0) fail(`t2i must not have LoadImage (found ${loads})`);

  if (file === "edit_api.json") {
    if (loads !== 1) fail(`edit must have exactly 1 LoadImage (@image_1); found ${loads}`);
    const enc = byTitle["@prompt"]?.[0]?.[1];
    const linked = enc && Array.isArray(enc.inputs?.["images.image_1"]);
    if (linked) ok("@prompt receives an image in 'images.image_1'");
    else {
      const names = Object.keys(enc?.inputs ?? {}).filter((k) => k.toLowerCase().includes("image"));
      warn(
        `'images.image_1' is not linked to @prompt. Inputs with 'image' in the name: ${
          names.length ? names.join(", ") : "none"
        }. Confirm the real names and record them in spec §14.`,
      );
    }
  }
}

console.log(failed ? "\nFailed: fix the items marked with ✗." : "\nOK.");
process.exit(failed ? 1 : 0);
