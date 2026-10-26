#!/usr/bin/env python3
# Derives workflows/api/fx_*.json (video effects, spec §14 decision 31) and restore_seedvr2_api.json
# (old video restoration, decision 32) from the tested workflows in ../comfyui-workflows: adds the
# @ titles the backend looks for, inserts the 5 s trim, drops the comparison outputs, applies the
# restoration script's settings and prunes nodes that feed no output. Run again when they change:
#   python3 scripts/derive-effect-workflows.py [path/to/comfyui-workflows]
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "comfyui-workflows")
SRC = os.path.join(REPO, "workflows") + "/"
OUT = os.path.join(ROOT, "workflows", "api") + "/"

def load(d): return json.load(open(SRC + d + "/workflow.api.json"))
def title(g, nid, t): g[nid].setdefault("_meta", {})["title"] = t
def links(n): return [v for v in n["inputs"].values() if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str)]
def prune(g, keep):
    seen, stack = set(), list(keep)
    while stack:
        k = stack.pop()
        if k in seen: continue
        seen.add(k); stack += [l[0] for l in links(g[k])]
    return {k: v for k, v in g.items() if k in seen}
def rewire(g, old, new, skip):
    for k, n in g.items():
        if k == skip: continue
        for i, v in n["inputs"].items():
            if v == [old, 0]: n["inputs"][i] = [new, 0]
def add_trim(g, load_id):
    g["fx_trim"] = {"class_type": "Video Slice", "_meta": {"title": "@trim"},
                    "inputs": {"video": [load_id, 0], "start_time": 0.0, "duration": 5.0, "strict_duration": False}}
    rewire(g, load_id, "fx_trim", "fx_trim")
def check_titles(g):
    ts = [n.get("_meta", {}).get("title", "") for n in g.values()]
    at = [t for t in ts if t.startswith("@")]
    assert len(at) == len(set(at)), at
    return sorted(at)
def save(g, name):
    json.dump(g, open(OUT + name, "w"), indent=2, ensure_ascii=False); open(OUT + name, "a").write("\n")
    print(name, len(g), "nodes", check_titles(g))

# Clean Plate (#60)
g = load("60-ltx23-clean-plate")
add_trim(g, "5102")
for nid, t in {"5102": "@video_in", "2483": "@prompt", "2612": "@negative", "4832": "@seed",
               "2004": "@first_frame", "4852": "@save"}.items(): title(g, nid, t)
save(prune(g, ["4852"]), "fx_clean_plate_api.json")

# Face Swap (#17): drop the two comparison VideoCombine outputs.
g = load("17-ltx23-face-swap")
for nid, t in {"345": "@video_in", "427": "@duration", "269": "@image_1", "641:498": "@prompt",
               "641:377": "@seed", "362": "@max_side", "341": "@save"}.items(): title(g, nid, t)
g["427"]["inputs"]["value"] = 5.0
save(prune(g, ["341"]), "fx_face_swap_api.json")

# Wan Animate 2 (#15): keep the result, drop the side-by-side comparison (292 + subgraph 291).
g = load("15-wan-animate-2")
add_trim(g, "240")
for nid, t in {"240": "@video_in", "189": "@image_1", "604": "@prompt", "605": "@character",
               "261:19": "@seed", "261:243": "@size", "261:258": "@windows", "261:247": "@frames", "246": "@save"}.items(): title(g, nid, t)
save(prune(g, ["246"]), "fx_animate_api.json")

# Character Swap (#14): duration lives in the Relay prepare node; seed in the window plan.
g = load("14-h3-character-swap")
for nid, t in {"source": "@video_in", "prepare": "@prepare", "reference": "@image_1",
               "subject": "@subject", "plan": "@seed", "save": "@save"}.items(): title(g, nid, t)
g["prepare"]["inputs"]["duration_seconds"] = 5.0
save(prune(g, ["save"]), "fx_character_swap_api.json")

# SeedVR2 video upscale of the VHS restoration (usecases/vhs-upscale): the settings restore_vhs.py
# writes on every run are baked in (automatic temporal chunks, overlap 1, "lab" color correction
# that keeps the cleanup's colors); the backend writes the file, the size, the model and the seed.
g = json.load(open(os.path.join(REPO, "usecases", "vhs-upscale", "seedvr2_video.api.json")))
for nid, t in {"73": "@video_in", "66:57": "@size", "66:52": "@model", "66:54": "@seed", "76": "@save"}.items(): title(g, nid, t)
resize = g["66:57"]["inputs"]
for k in [k for k in resize if k.startswith("resize_type.")]: del resize[k]
resize.update({"resize_type": "scale dimensions", "resize_type.width": 960, "resize_type.height": 720, "resize_type.crop": "disabled"})
g["66:105"]["inputs"]["value"] = True
g["66:99"]["inputs"]["temporal_overlap"] = 1
g["66:59"]["inputs"]["color_correction_method"] = "lab"
g["76"]["inputs"]["filename_prefix"] = "bigos/restore"
save(prune(g, ["76"]), "restore_seedvr2_api.json")
