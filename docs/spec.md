# Spec — Gerador de imagens simples sobre ComfyUI (Qwen Image 2.1)

> Status: rascunho v0.3 · 2026-09-25
> Mudanças na v0.3: **fundo transparente** (checkbox em todas as telas) entrou no MVP (§8.2); trocar a proporção na edição passou a constar como requisito do MVP (§7).
> Mudanças da v0.1 para a v0.2: decisões de §14 aplicadas; duas telas (Gerar com referências opcionais, Editar); seletor de tamanho por proporção + resolução (§5); "manter original" virou uma opção do seletor (§7); seletor de qualidade (§8); autenticação e multiusuário saíram do MVP.
> Itens marcados com **(proposta)** são sugestões minhas, não vêm dos templates nem de decisões suas.
>
> **Termos usados na UI e nesta spec**
> - **Tamanho** = o conjunto de controles de proporção + resolução (ou Manual/Original), que resulta em largura × altura.
> - **Resolução** = o tamanho em megapixels, com rótulo (Pequeno 1 MP, Médio 2 MP, Grande 4 MP).
> - **Qualidade** = os passos de amostragem (`steps`): Normal ou Alta.
> - `resolution` (em código) = parâmetro interno do encoder do ComfyUI. **Não** tem relação com a Resolução da UI.

## 1. Objetivo

Interface web simples para que pessoas leigas gerem e editem imagens com workflows do ComfyUI, sem contato com o editor de nós. O usuário escolhe uma tela, preenche poucos campos e recebe a imagem. Modelos, sampler, cfg e nós ficam escondidos no backend.

## 2. Escopo

**Dentro (MVP)**
- Tela **Gerar**: prompt + referências opcionais (0 a 10 imagens).
- Tela **Editar**: 1 imagem + instrução.
- Seletor de tamanho por proporção e resolução, com opção **Manual** (Gerar e Editar) e **Original** (só Editar). Na Editar o usuário pode **trocar a proporção** da imagem (§7).
- Seletor de qualidade (passos de amostragem).
- Checkbox **Fundo transparente** em todas as telas (§8.2).
- Um único modelo (Qwen Image 2.1, variante int8) nos dois workflows.
- Fila de execução com progresso.

**Fora (por enquanto)**
- Autenticação, contas e histórico por usuário (uso pessoal/rede confiável; ver §12).
- Editor de workflows ou upload de workflows pelo usuário final.
- Máscara/inpainting, LoRA, ControlNet, vídeo, upscaling.
- Escolha de modelo, sampler ou cfg pelo usuário.
- Cobrança e cotas.

## 3. Telas e workflows

| Tela | Entradas do usuário | Workflow ComfyUI |
|------|---------------------|------------------|
| **Gerar**, sem referências | prompt, tamanho, qualidade | `image_qwen_image_2_1_t2i` |
| **Gerar**, com 1 a 10 referências | prompt, referências, tamanho, qualidade | `image_qwen_image_2_1_image_edit` |
| **Editar** | 1 imagem, instrução, tamanho (padrão: Original), qualidade | `image_qwen_image_2_1_image_edit` |

O usuário vê só duas telas. **O backend escolhe o workflow pela quantidade de imagens**: zero referências usa o t2i; uma ou mais usa o de edição. No workflow de edição, `image_1` é o alvo/base e as demais são referências (o template aceita até 10 imagens). Na tela Gerar, o tamanho vem sempre do seletor (§5), nunca da imagem.

## 4. Campos por tela

### Gerar
- **Prompt**: obrigatório, multilinha.
- **Referências** (opcional): botão "Adicionar imagens", de 0 a 10 (configurável, `MAX_REFS`). Miniaturas com remover e reordenar. A ordem importa: a UI rotula "Imagem 1", "Imagem 2"... e no prompt elas são citadas como `<image1>`, `<image2>`. **(proposta)** Botão/atalho que insere uma menção "Imagem N" no prompt e o backend a converte em `<imageN>`, para o leigo não digitar os sinais; reordenar renumera.
- **Tamanho**: proporção + resolução (§5). Padrão **1:1 · 1 MP = 1024 × 1024**.
- **Qualidade**: §8.1.
- **Fundo transparente**: checkbox, desligado por padrão (§8.2).
- Avançado (oculto): seed (padrão aleatória).

### Editar
- **Imagem**: exatamente 1, obrigatória.
- **Instrução**: obrigatória (ex.: "troque o fundo por uma praia").
- **Tamanho**: proporção + resolução, com **Original** como padrão (§5 e §7).
- **Qualidade**, **Fundo transparente** e avançado: iguais à tela Gerar.

## 5. Seletor de tamanho

Dois controles, e o resultado em pixels aparece **bloqueado** ao lado:

1. **Proporção**: `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `3:2`, `2:3`, **Manual** e, só na tela Editar, **Original**.
2. **Resolução** (rótulo + megapixels):

| Rótulo | MP nominal | Observação |
|--------|-----------:|------------|
| Pequeno | 1 MP | padrão do template; mais rápido |
| Médio | 2 MP | |
| Grande | 4 MP | 2048 × 2048 no quadrado (2K nativo) |

Comportamento:
- **Preset de proporção:** largura e altura são calculadas, exibidas e travadas (não editáveis).
- **Manual:** o seletor de resolução some e os campos largura/altura ficam abertos, com regras de §6 e o MP resultante exibido ao vivo.
- **Original** (só Editar): o seletor de resolução some e a UI mostra as dimensões detectadas da imagem e a saída estimada (§7).
- Trocar de preset para Manual pré-preenche os campos com o valor atual.

**Cálculo dos presets.** 1 MP = 1024 × 1024 = 1.048.576 px (mesma base do template).

```
P = mp * 1024 * 1024
w = sqrt(P * a / b);  h = P / w          # a:b = proporção
W = round32(w);  H = round32(h)           # múltiplos de 32, arredondando ao mais próximo
se W*H > MAX_PIXELS: usar floor32 nas duas dimensões
```

Resultado (largura × altura):

| Proporção | 1 MP (Pequeno) | 2 MP (Médio) | 4 MP (Grande) |
|-----------|---------------:|-------------:|--------------:|
| 1:1  | 1024 × 1024 | 1440 × 1440 | 2048 × 2048 |
| 4:3  | 1184 × 896  | 1664 × 1248 | 2368 × 1760 |
| 3:4  | 896 × 1184  | 1248 × 1664 | 1760 × 2368 |
| 16:9 | 1376 × 768  | 1920 × 1088 | 2720 × 1536 |
| 9:16 | 768 × 1376  | 1088 × 1920 | 1536 × 2720 |
| 3:2  | 1248 × 832  | 1760 × 1184 | 2496 × 1664 |
| 2:3  | 832 × 1248  | 1184 × 1760 | 1664 × 2496 |

Os valores reais ficam entre 0,99 e 1,01 do nominal (1 MP), entre 1,98 e 1,99 (2 MP) e entre 3,96 e 4,00 (4 MP), por causa do múltiplo de 32 (por isso 16:9 usa 1088 em vez de 1080). Fonte de verdade: o backend recalcula a partir de (proporção, resolução) e não confia no par enviado pelo front; no modo Manual valida o par recebido.

## 6. Regras de tamanho

- Inteiros, múltiplos de 32 (a UI arredonda ao mais próximo ao sair do campo).
- Pixels totais ≤ `MAX_PIXELS` (padrão 4.194.304 = 2048²).
- Lado mínimo 512 **(proposta)**.
- Limites configuráveis por variável de ambiente, pois dependem da VRAM.
- O limite é **em pixels totais**, então o preset 16:9 de 4 MP tem lado de 2720. As notas do template falam em suporte "até 2048" sem dizer se é por lado ou em pixels; ver §14 (a validar).

## 7. "Original" (tela Editar)

Como o template do workflow de edição resolve, sem nós extras: um `switch` (rótulo `custom_size`) escolhe o latent que alimenta o KSampler.

| Situação | `switch` | `resolution` | `width`/`height` |
|----------|----------|--------------|------------------|
| Editar, proporção **Original** | `false` (tamanho segue `image_1`) | `0` | ignorados |
| Editar, outra proporção ou Manual | `true` | `0` | calculados/informados |
| Gerar com referências | `true` | `0` | calculados/informados |

Aqui `resolution` é o parâmetro interno do encoder do ComfyUI, sem relação com a **Resolução** (MP) da UI. Com valor `0` significa, segundo o template, "sem redimensionar além de arredondar para múltiplo de 32".

Regras:
1. **Aproximado é aceitável (decidido).** Como o tamanho é ajustado a múltiplo de 32, a saída pode diferir em até 31 px por lado da imagem original. Não há reescala para o tamanho exato.
2. **Imagem de entrada grande.** Com `resolution = 0` uma foto de 12 MP rodaria em tamanho cheio e pode estourar a VRAM. O backend **redimensiona a imagem com Pillow** (mantendo a proporção) para caber em `MAX_INPUT_PIXELS` antes de enviá-la ao ComfyUI, e avisa o usuário na UI. Assim `resolution` fica sempre `0` e não dependemos da unidade desse parâmetro. O mesmo limite vale para as referências.
3. **Outra proporção na edição (requisito do MVP).** O usuário pode escolher qualquer proporção (ou Manual) na tela Editar. As notas do template avisam que, se o tamanho ficar longe do de `image_1`, a edição pode "deslocar". A UI avisa quando a proporção escolhida difere da original. Como o modelo trata isso na prática (recorta, estica ou desloca o conteúdo) precisa ser testado (§14).
4. **"Original" = dimensões.** O template regenera a imagem inteira (KSampler com `denoise = 1`), então isso não preserva os pixels fora da área editada. Isso exigiria máscara e composição (fora do escopo).

## 8. Qualidade e fundo transparente

### 8.1 Qualidade

Seletor de **Qualidade** com duas opções, mapeado para `steps` do KSampler:

| Opção | `steps` | Nota |
|-------|--------:|------|
| Normal (padrão) | 25 | valor do template |
| Alta | 40 **(proposta)** | as notas do template dizem que o pipeline oficial usa cerca de 40–50 com `euler` |

Os valores ficam em configuração. Fixos e invisíveis ao usuário: `cfg = 1`, `sampler = euler`, `scheduler = simple`.

### 8.2 Fundo transparente

Checkbox **Fundo transparente**, desligado por padrão, presente nas telas Gerar e Editar.

Como funciona: as notas do template t2i dizem que o modelo gera imagem RGBA por instrução no próprio prompt, sem nós extras. Com o checkbox ligado, o backend embrulha o texto do usuário e envia o resultado como prompt:

```
This is an RGBA format image with transparency. <prompt do usuário>. The image has an alpha channel and a transparent background.
```

- **Formato de saída:** PNG é obrigatório para manter o canal alfa. Já é o formato fixo do `SaveImageAdvanced` (§9.2); não oferecer JPG/WebP.
- **Preview e download:** com o checkbox ligado, o preview usa fundo xadrez (senão a transparência aparece como cor sólida) e o download é o PNG original.
- **Editar:** o mesmo embrulho é aplicado em volta da instrução de edição. As notas do template de edição **não** descrevem transparência, então esse comportamento é uma suposição a validar (§14).
- **Desligado:** o prompt segue exatamente como digitado. Não há remoção de fundo por pós-processamento no MVP.
- O trecho embrulhador fica em inglês, mesmo com prompt em português (mistura a testar, §14).

## 9. Mapeamento com o ComfyUI

### 9.1 Formato dos workflows
Os templates estão no formato de UI e usam **subgraph** (`Text to Image (Qwen Image 2.1)` e `Image Edit (Qwen Image 2.1)`). O backend precisa do **API format** (`Save (API Format)` com *Dev mode options* ativo), que achata o subgraph, e os IDs dos nós mudam a cada edição.

Regra: o backend localiza nós por **`_meta.title`**, nunca por ID. Antes de exportar, desempacotar o subgraph e renomear os nós conforme a tabela de `workflows/README.md`: `@prompt`, `@latent_size`, `@sampler`, `@custom_size`, `@image_1` e `@save`. Um título por nó: `width` e `height` moram no mesmo nó (`@latent_size`), assim como `seed`, `steps` e `cfg` (`@sampler`); o parâmetro `resolution` fica no nó `@prompt`. O script `scripts/check-workflows.mjs` valida os JSONs exportados.

Antes de exportar, **remover o nó `ResolutionSelector`** dos dois workflows. Assim `width` e `height` viram valores simples no JSON e o backend os escreve direto (confirmar no export, §14).

### 9.2 Campos lógicos → nós

| Campo lógico | Nó (`class_type`) | Input | T2I | Edit | Valor |
|--------------|-------------------|-------|:---:|:----:|-------|
| prompt | `TextEncodeQwenImage21` | `prompt` | ✓ | ✓ | usuário (embrulhado se Fundo transparente, §8.2) |
| negative_prompt | `TextEncodeQwenImage21` | `negative_prompt` | ✓ | ✓ | `""` (ignorado com cfg = 1) |
| encoder_resolution (interno; não é a Resolução da UI) | `TextEncodeQwenImage21` | `resolution` | | ✓ | `0` |
| width / height | `EmptyLatentImage` | `width`, `height` | ✓ | ✓ (se `switch = true`) | calculados/informados |
| custom_size | `ComfySwitchNode` | `switch` | | ✓ | conforme §7 |
| seed | `KSampler` | `seed` | ✓ | ✓ | aleatória por execução |
| steps | `KSampler` | `steps` | ✓ | ✓ | conforme §8 |
| cfg | `KSampler` | `cfg` | ✓ | ✓ | `1` |
| sampler / scheduler | `KSampler` | `sampler_name`, `scheduler` | ✓ | ✓ | `euler` / `simple` |
| imagens | `LoadImage` (1 por imagem) | `image` | | ✓ | nome devolvido por `POST /upload/image` |
| saída | `SaveImageAdvanced` | — | ✓ | ✓ | PNG, 8-bit, sRGB (formato fixo; necessário para o alfa) |

No subgraph, os rótulos `sampler` e `scheduler` têm nomes internos trocados (`scheduler` → `sampler_name`, `scheduler_1` → `scheduler`). No JSON de API valem os nomes do `KSampler`.

### 9.3 Quantidade variável de imagens (1 a 10)
No workflow de edição, as imagens entram no `TextEncodeQwenImage21` como entradas opcionais `images.image_1` a `images.image_N`. Como as entradas não conectadas são opcionais, o backend **monta o grafo dinamicamente**: clona o nó `@image_1` (`LoadImage`) para cada imagem enviada e liga cada um à entrada correspondente do encoder. Alternativa, se a injeção não funcionar: um JSON exportado por quantidade de imagens.

### 9.4 Modelos (fixos)

| Tipo | Arquivo | Pasta |
|------|---------|-------|
| Diffusion | `qwen_image_2.1_int8_convrot.safetensors` | `models/diffusion_models/` |
| Text encoder | `qwen3vl_8b_int8_convrot.safetensors` (`CLIPLoader`, type `qwen_image`) | `models/text_encoders/` |
| VAE | `qwen_image_2.1_vae_bf16.safetensors` | `models/vae/` |

Fonte: Hugging Face `Comfy-Org/Qwen-Image-2.1`. O workflow de edição também usa `QwenImage21Cache` (`device=auto`, `dtype=default`), mantidos nos valores do template. Os workflows usam nós novos (`TextEncodeQwenImage21`, `QwenImage21Cache`, `SaveImageAdvanced`, `ComfySwitchNode`); as notas dos templates pedem ComfyUI atualizado, e versões estáveis/Desktop podem não ter nós de nightly.

## 10. Contrato do backend **(proposta)**

```json
POST /api/jobs
{
  "screen": "generate",                       // ou "edit"
  "prompt": "…",
  "images": ["<upload_id>", "…"],             // generate: 0..10 · edit: exatamente 1
  "size": { "ratio": "16:9", "megapixels": 2 },        // Resolução: 1 | 2 | 4 MP
  //     ou { "ratio": "manual", "width": 1280, "height": 720 }
  //     ou { "ratio": "original" }                     // só em "edit"
  "quality": "normal",                        // ou "high" (Qualidade = passos)
  "transparent_background": false,
  "seed": null                                // null = aleatória
}
```

Uploads são enviados antes por `POST /api/uploads` (retorna `upload_id`). O backend valida, calcula o tamanho, escolhe o workflow (§3), preenche os nós (§9) e devolve `job_id` para acompanhamento.

## 11. Fluxo de execução

1. Validar entrada (campos obrigatórios, tipo/tamanho dos arquivos, regras de §6, tela × proporção `original`).
2. Reduzir imagens acima de `MAX_INPUT_PIXELS` (§7.2) e enviar cada uma ao ComfyUI com `POST /upload/image`.
3. Escolher o workflow, calcular width/height, montar o grafo (§9), embrulhar o prompt se Fundo transparente (§8.2) e gerar a seed.
4. `POST /prompt` com um `client_id` por sessão e guardar o `prompt_id`.
5. Acompanhar progresso e posição na fila por WebSocket (`/ws?clientId=...`).
6. Ao terminar, ler `/history/{prompt_id}` e baixar o resultado por `/view`.
7. Entregar a imagem à UI e limpar arquivos temporários conforme a retenção configurada.

## 12. Requisitos não funcionais

- **Segurança:** o ComfyUI não tem autenticação e permite instalar custom nodes, então **não expor a porta do ComfyUI**; só o backend fala com ele. Sem login no MVP, o app deve rodar em rede confiável; expor à internet exige proxy reverso com autenticação antes.
- **Fila:** uma geração por vez por GPU. O backend controla a fila, mostra estado/progresso (e posição, se houver outras execuções) e permite cancelar.
- **Uploads:** PNG/JPG/WebP; limite de bytes e de dimensão configuráveis.
- **Erros amigáveis:** mensagens em português para falhas comuns (imagem inválida, tamanho fora do limite, ComfyUI indisponível, fila ocupada).
- **Versionamento:** cada workflow (JSON de API + arquivo de mapeamento) versionado junto, para que mudar um nó não quebre o backend silenciosamente.
- **Configuração:** `MAX_REFS` (10), `MAX_PIXELS` (4.194.304), `MAX_INPUT_PIXELS`, passos por qualidade, retenção de arquivos.

## 13. Critérios de aceite

- **Gerar, sem referências, sem mexer em nada:** gera PNG 1024 × 1024 (1:1 · 1 MP) pelo workflow t2i.
- **Presets:** cada combinação da tabela de §5 gera exatamente as dimensões da tabela, e os campos aparecem bloqueados.
- **Manual:** os campos abrem; valores fora da regra de §6 são ajustados com aviso ou rejeitados; uma imagem 1280 × 736 é gerada com essas dimensões.
- **Gerar, com referências:** ao adicionar a 1ª imagem o backend passa a usar o workflow de edição; o prompt pode citar `<image1>` e `<image2>`; a ordem das imagens é respeitada; aceita 10 imagens e rejeita a 11ª.
- **Editar, Original (padrão):** nenhum seletor de resolução aparece; a saída tem as dimensões da entrada arredondadas para múltiplo de 32 (diferença ≤ 31 px por lado).
- **Editar, outra proporção ou Manual:** o backend envia `switch = true` com os valores calculados; a UI avisa quando a proporção difere da original.
- **Editar, imagem acima do limite:** a execução não estoura VRAM; a imagem é reduzida e o usuário é avisado.
- **Qualidade:** "Alta" executa com mais passos que "Normal" e demora mais.
- **Fundo transparente (Gerar e Editar):** com o checkbox ligado, o PNG resultante tem canal alfa e parte dos pixels com alfa menor que 255 (verificável por script), e o preview mostra fundo xadrez. Desligado, o prompt chega ao ComfyUI sem alteração.
- **Geral:** duas execuções idênticas sem seed fixa geram resultados diferentes; com a GPU ocupada, o usuário vê o estado de espera.

## 14. Decisões e pontos em aberto

**Decisões tomadas (v0.2)**
1. Geração com referências e edição usam o mesmo workflow (o de edição); geração sem referências usa o t2i.
2. Até 10 referências; a tela Gerar é única, com referências opcionais (como nos clientes de IA comuns).
3. Dimensão aproximada é aceitável em "Original"; sem reescala para o tamanho exato.
4. Seletor de qualidade (passos) exposto ao usuário.
5. Sem autenticação nem histórico por usuário no MVP.
6. Tamanho definido por proporção + resolução (rótulo + MP), com **Manual** (campos abertos) e **Original** (só edição).
7. Entram no MVP: checkbox de **Fundo transparente** em todas as telas e a **troca de proporção na Editar**.

**A definir**
- **Rótulos e padrões:** Pequeno / Médio / Grande e o padrão 1 MP são sugestões; "Alta" = 40 passos é proposta.
- **Original com resolução:** hoje "Original" mantém as dimensões e esconde a resolução. Permitir "proporção da imagem + 1/2/4 MP" (para ampliar mantendo a proporção) é possível, mas fica fora por enquanto.

**A validar em teste**
- **Limite "2048":** se as notas do template significam 2048 por lado ou 2048² em pixels. Se for por lado, os presets 16:9 e 3:2 de 4 MP (lado de 2720 e 2496) precisam de outro cálculo.
- **`resolution = 0`:** que realmente não redimensiona (além do múltiplo de 32) com imagens de tamanhos variados.
- **Injeção de imagens:** nomes reais de `images.image_N` no JSON de API e se o grafo dinâmico de §9.3 funciona; senão, um JSON por quantidade.
- **`ResolutionSelector`:** se removê-lo deixa `width`/`height` como valores simples no export.
- **VRAM:** limites reais de `MAX_PIXELS` e `MAX_INPUT_PIXELS`, incluindo 10 referências e o preset de 4 MP.
- **Prompts em português:** os exemplos dos templates são em inglês; testar e, se a qualidade cair, considerar tradução automática.
- **Proporção diferente de `image_1`:** comportamento quando a tela Gerar usa referências com proporção distinta do tamanho pedido.
- **Alfa ponta a ponta:** se `SaveImageAdvanced` e `/view` preservam o canal alfa e se o prompt embrulhado produz mesmo fundo transparente no t2i (é o único workflow em que o template descreve isso).
- **Transparência na edição:** se o embrulho funciona no workflow de edição, inclusive com referências. Se não funcionar, o checkbox fica só na tela Gerar ou a Editar passa a usar outra formulação.
- **Editar com proporção diferente da original:** se o modelo recorta, estica ou desloca o conteúdo. Isso decide se basta o aviso ou se a UI precisa mostrar uma prévia do enquadramento **(proposta)**.
- **Embrulho em inglês com prompt em português:** se a mistura afeta a qualidade ou a transparência.

**Futuro (fora do MVP):** autenticação e histórico por usuário.

## 15. Referências

- Template t2i: `image_qwen_image_2_1_t2i.json` (Comfy-Org/workflow_templates)
- Template edição: `image_qwen_image_2_1_image_edit.json` (Comfy-Org/workflow_templates)
- Modelos: https://huggingface.co/Comfy-Org/Qwen-Image-2.1
