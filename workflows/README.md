# Workflows do ComfyUI

- `templates-ui/`: os dois templates originais do Comfy-Org (formato de UI, com subgraph). **Só referência.**
- `api/`: os workflows **exportados em API format**, que o backend realmente usa. Você gera esses arquivos (veja abaixo).

Arquivos esperados em `api/`: `api/t2i_api.json`, `api/edit_api.json`, `api/video_fl2va_api.json` e `api/video_ref2va_api.json`.

Os dois de vídeo (MiniMax H3, spec §14 decisão 28) foram derivados do `api/video_api.json` (o workflow com o nó `MiniMaxH3DirectorCS`, mantido só como referência): o Director foi trocado pelos nós nativos `MiniMaxH3ImageToVideo` (sem referências) e `MiniMaxH3ReferenceToVideo` (com referências), mais `MiniMaxH3SigmaShift`.

## Como exportar

Os nomes exatos dos menus podem variar conforme a versão do frontend do ComfyUI.

1. Atualize o ComfyUI e instale os modelos (spec §9.4). Abra cada template: arraste o JSON de `templates-ui/` para o canvas, ou use o menu de templates.
2. **Desempacote o subgraph** (clique com o botão direito no nó do subgraph e escolha a opção de desempacotar). Assim os nós internos (loaders, encoder, latent, KSampler) ficam no grafo principal e podem receber títulos.
3. **Remova nós que não devem existir no export:**
   - nos dois workflows: `ResolutionSelector` (o backend escreve `width`/`height` direto);
   - só no de edição: `ImageCompare` e o **segundo** `LoadImage` (era só um exemplo de roupa). Mantenha um único `LoadImage`.
4. **Ajuste valores:** no de edição, `resolution` do encoder em `0`. Os demais valores serão sobrescritos pelo backend; deixe os padrões do template.
5. **Renomeie os nós** (duplo clique no título, ou botão direito → Título) conforme a tabela abaixo. Um título por nó, sem repetir.
6. Ative **Dev mode options** nas configurações do ComfyUI e use **Save (API Format)**. Salve em `workflows/api/` como `api/t2i_api.json` e `api/edit_api.json`.
7. Valide:

```bash
node scripts/check-workflows.mjs
```

## Convenção de títulos

| Título | `class_type` | Inputs que o backend escreve | t2i | edit |
|--------|--------------|------------------------------|:---:|:----:|
| `@prompt` | `TextEncodeQwenImage21` | `prompt`, `negative_prompt` (+ `resolution` no edit) | ✓ | ✓ |
| `@latent_size` | `EmptyLatentImage` | `width`, `height` | ✓ | ✓ |
| `@sampler` | `KSampler` | `seed`, `steps`, `cfg`, `sampler_name`, `scheduler` | ✓ | ✓ |
| `@custom_size` | `ComfySwitchNode` | `switch` | | ✓ |
| `@image_1` | `LoadImage` | `image` (o backend clona este nó para `image_2` a `image_10`) | | ✓ |
| `@save` | `SaveImageAdvanced` | — (formato PNG fixo) | ✓ | ✓ |

Vídeo:

| Título | `class_type` | Inputs que o backend escreve | fl2va | ref2va |
|--------|--------------|------------------------------|:-----:|:------:|
| `@video` | `MiniMaxH3ImageToVideo` / `MiniMaxH3ReferenceToVideo` | `prompt`, `width`, `height`, `length` | ✓ | ✓ |
| `@seed` | `RandomNoise` | `noise_seed` | ✓ | ✓ |
| `@image_1` | `LoadImage` | `image` (clonado para `image_2` a `image_9`, ligados em `ref_images.ref_image_N`) | | ✓ |
| `@save` | `VHS_VideoCombine` | — (mp4 h264 + áudio) | ✓ | ✓ |

Música (`audio_minimax_music_3.json`, spec §14 decisão 30; mantém o nome do export):

| Título | `class_type` | Inputs que o backend escreve |
|--------|--------------|------------------------------|
| `@music` | `MiniMaxMusic3TextEncode` | `caption`, `lyrics`, `max_duration` |
| `@seed` | `SeedNode` | `seed` (liga no encoder e no KSampler) |
| `@save` | `SaveAudioAdvanced` | — (MP3 V0) |

Efeitos de vídeo (spec §14, decisão 31). Gerados por `python3 scripts/derive-effect-workflows.py` a partir dos `workflow.api.json` testados em `../comfyui-workflows` (não são exports manuais): o script põe os títulos, insere o corte (`Video Slice`, nó `fx_trim`), tira as saídas de comparação e poda nós que não chegam a nenhuma saída. Rode de novo se aqueles workflows mudarem.

| Arquivo | Origem | Títulos (`class_type` → inputs que o backend escreve) |
|---------|--------|-------------------------------------------------------|
| `fx_clean_plate_api.json` | #60 LTX 2.3 Clean Plate | `@video_in` `LoadVideo` → `file`; `@trim` `Video Slice` → `duration`; `@prompt` / `@negative` `CLIPTextEncode` → `text`; `@seed` `RandomNoise` → `noise_seed`; `@first_frame` `LoadImage` → `image` (ramo em bypass, mas o arquivo precisa existir); `@save` `SaveVideo` |
| `fx_face_swap_api.json` | #17 LTX 2.3 head swap | `@video_in` `VHS_LoadVideo` → `video`, `custom_width`, `custom_height` (reduz vídeos maiores que `@max_side` ao carregar); `@duration` `PrimitiveFloat` → `value`; `@max_side` `PrimitiveInt` (só lido); `@image_1` `LoadImage` → `image` (rosto); `@prompt` `PrimitiveStringMultiline` → `value`; `@seed` `RandomNoise` → `noise_seed`; `@save` `SaveVideo` |
| `fx_animate_api.json` | #15 Wan Animate 2 | `@video_in` `LoadVideo` → `file`; `@trim` `Video Slice` → `duration`; `@size` `ResizeImageMaskNode` → `resize_type.width/height` (orientação do vídeo, pixels do template); `@image_1` `LoadImage` → `image` (personagem); `@prompt` / `@character` `PrimitiveStringMultiline` → `value`; `@seed` `SamplerCustom` → `noise_seed`; `@save` `SaveVideo` |
| `fx_character_swap_api.json` | #14 H3 Character Swap | `@video_in` `LoadVideo` → `file`; `@prepare` `H3RelayPrepareSource` → `duration_seconds`; `@image_1` `LoadImage` → `image` (personagem); `@subject` `CLIPTextEncode` → `text` (para o SAM, em inglês); `@seed` `H3RelayWindowPlan` → `seed`; `@save` `SaveVideo` |

O `SaveVideo` nativo devolve o arquivo em `outputs[id].images[0]` com `animated: [true]` (o `VHS_VideoCombine` usa `gifs`).

`width` e `height` moram no mesmo nó (`@latent_size`), e `seed`/`steps`/`cfg` no mesmo nó (`@sampler`).

## Pontos que só o export real responde (spec §14)

- Nome exato das entradas de imagem do encoder no JSON de API (esperado: `images.image_1` ... `images.image_N`).
- Se, sem o `ResolutionSelector`, `width` e `height` ficam como valores simples.
- Como o `SaveImageAdvanced` grava as opções de formato (`format`, `format.bit_depth`, `format.input_color_space`).

O validador avisa quando não encontra algo disso. Se o export divergir da spec, ajuste a spec, não o contrário.
