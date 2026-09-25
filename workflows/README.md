# Workflows do ComfyUI

- `templates-ui/`: os dois templates originais do Comfy-Org (formato de UI, com subgraph). **Só referência.**
- `api/`: os workflows **exportados em API format**, que o backend realmente usa. Você gera esses arquivos (veja abaixo).

Arquivos esperados em `api/`: `api/t2i_api.json` e `api/edit_api.json`.

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

`width` e `height` moram no mesmo nó (`@latent_size`), e `seed`/`steps`/`cfg` no mesmo nó (`@sampler`).

## Pontos que só o export real responde (spec §14)

- Nome exato das entradas de imagem do encoder no JSON de API (esperado: `images.image_1` ... `images.image_N`).
- Se, sem o `ResolutionSelector`, `width` e `height` ficam como valores simples.
- Como o `SaveImageAdvanced` grava as opções de formato (`format`, `format.bit_depth`, `format.input_color_space`).

O validador avisa quando não encontra algo disso. Se o export divergir da spec, ajuste a spec, não o contrário.
