#!/usr/bin/env node
// Valida os workflows exportados em API format (workflows/api/).
// Uso: node scripts/check-workflows.mjs [pasta]   (padrão: workflows/api)
// Sai com código 1 se algo obrigatório estiver errado. Avisos (!) não falham.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "workflows/api";

const PROMPT = ["prompt", "negative_prompt"];
const LATENT = ["width", "height"];
const SAMPLER = ["seed", "steps", "cfg", "sampler_name", "scheduler"];

// título -> [class_type, inputs que o backend escreve (devem ser valores, não ligações)]
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
};

const FORBIDDEN = ["ResolutionSelector", "ImageCompare"];

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
    fail(`arquivo não encontrado em ${dir}`);
    continue;
  }

  let wf;
  try {
    wf = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    fail(`JSON inválido: ${e.message}`);
    continue;
  }

  if (Array.isArray(wf.nodes) || wf.links) {
    fail("parece o formato de UI (tem 'nodes'/'links'). Exporte com Save (API Format).");
    continue;
  }
  const nodes = Object.entries(wf).filter(([, n]) => n && typeof n === "object" && n.class_type);
  if (nodes.length === 0) {
    fail("nenhum nó com class_type: não é API format");
    continue;
  }
  ok(`${nodes.length} nós, formato API`);

  for (const [id, n] of nodes) {
    if (FORBIDDEN.includes(n.class_type)) {
      fail(`nó ${id} (${n.class_type}) deve ser removido antes de exportar`);
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
      fail(`${title}: esperado 1 nó com esse título, encontrei ${found.length}`);
      continue;
    }
    const [id, n] = found[0];
    if (n.class_type !== cls) {
      fail(`${title} (nó ${id}): class_type é ${n.class_type}, esperado ${cls}`);
      continue;
    }
    const problems = [];
    for (const k of keys) {
      if (!(k in (n.inputs ?? {}))) problems.push(`falta o input '${k}'`);
      else if (Array.isArray(n.inputs[k])) problems.push(`'${k}' está ligado a outro nó (deve ser valor fixo)`);
    }
    if (problems.length) fail(`${title} (nó ${id}): ${problems.join("; ")}`);
    else ok(`${title} → ${cls} (nó ${id})`);
  }

  for (const t of Object.keys(byTitle)) {
    if (!(t in expected)) warn(`título ${t} não faz parte da convenção (ignorado)`);
  }

  const loads = nodes.filter(([, n]) => n.class_type === "LoadImage").length;
  if (file === "t2i_api.json" && loads > 0) fail(`o t2i não deve ter LoadImage (achei ${loads})`);

  if (file === "edit_api.json") {
    if (loads !== 1) fail(`o edit deve ter exatamente 1 LoadImage (@image_1); achei ${loads}`);
    const enc = byTitle["@prompt"]?.[0]?.[1];
    const linked = enc && Array.isArray(enc.inputs?.["images.image_1"]);
    if (linked) ok("@prompt recebe imagem em 'images.image_1'");
    else {
      const names = Object.keys(enc?.inputs ?? {}).filter((k) => k.toLowerCase().includes("image"));
      warn(
        `não achei 'images.image_1' ligado ao @prompt. Entradas com 'image' no nome: ${
          names.length ? names.join(", ") : "nenhuma"
        }. Confirme os nomes reais e registre na spec §14.`,
      );
    }
  }
}

console.log(failed ? "\nFalhou: corrija os itens marcados com ✗." : "\nOK.");
process.exit(failed ? 1 : 0);
