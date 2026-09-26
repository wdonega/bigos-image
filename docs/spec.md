# Spec — Gerador de imagens simples sobre ComfyUI (Qwen Image 2.1)

> Status: rascunho v0.4 · 2026-09-25
> Mudanças na v0.4: decisões do plano (§14, "Decisões tomadas (v0.4)"): imagens pequenas são ampliadas até `MIN_SIDE`; `image_1` é ajustada a múltiplo de 32 pelo backend; limite de proporção no Manual; fila persistida em Redis (BullMQ); sharp no lugar de Pillow; um `client_id` por processo; ComfyUI exposto sem login (risco aceito, §12). Resultados já descobertos em §14.
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
- **Melhorar texto** e **Estilo**: decisão 23 (§14).
- A seed é sempre aleatória e não aparece na interface (decisão 18, §14).

### Editar
- **Imagem**: exatamente 1, obrigatória.
- **Instrução**: obrigatória (ex.: "troque o fundo por uma praia").
- **Tamanho**: proporção + resolução, com **Original** como padrão (§5 e §7).
- **Qualidade**, **Fundo transparente**, **Melhorar texto** e **Estilo**: iguais à tela Gerar.

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
- Lado mínimo 512 (`MIN_SIDE`).
- Proporção máxima 1:4 entre os lados (`MAX_ASPECT_RATIO`, padrão 4), para evitar tiras extremas no Manual (decidido na v0.4).
- No Manual, a UI arredonda para múltiplo de 32 ao sair do campo e avisa; o backend **rejeita** (400) qualquer par que ainda chegue fora destas regras.
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
2. **Imagem de entrada grande.** Com `resolution = 0` uma foto de 12 MP rodaria em tamanho cheio e pode estourar a VRAM. O backend **redimensiona a imagem com sharp** (mantendo a proporção) para caber em `MAX_INPUT_PIXELS` antes de enviá-la ao ComfyUI, e avisa o usuário na UI. Assim `resolution` fica sempre `0` e não dependemos da unidade desse parâmetro. O mesmo limite vale para as referências.
   - **Imagem pequena (v0.4):** se o menor lado estiver abaixo de `MIN_SIDE`, o backend **amplia** a imagem (sharp, mantendo a proporção) até o menor lado chegar a `MIN_SIDE`, e a UI avisa que o resultado pode ficar menos nítido. Vale para `image_1` e referências.
   - **Múltiplo de 32 (v0.4):** depois de reduzir/ampliar, o backend ajusta `image_1` para largura e altura múltiplas de 32 (`floor32`, recorte central de no máximo 31 px por lado). Assim a saída em "Original" é exata e conhecida antes da execução, e nunca passa de `MAX_PIXELS`.
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
- **Desligado:** o prompt segue exatamente como digitado. Não há remoção de fundo por pós-processamento no MVP. **(v0.4)** O modelo sempre devolve RGBA; sem o embrulho o alfa é só ruído (valores 204–255, §14). O backend remove o canal alfa desses resultados para entregar um PNG opaco de verdade.
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
  "style": "watercolor"                       // ou null (decisão 23)
  // sem "seed": o backend sorteia uma por execução; um "seed" enviado é ignorado (decisão 18)
}
```

`POST /api/enhance` `{ "prompt": "…", "locale": "pt-BR" }` → `{ "text": "…" }` (decisão 23).

Uploads são enviados antes por `POST /api/uploads` (retorna `upload_id`). O backend valida, calcula o tamanho, escolhe o workflow (§3), preenche os nós (§9) e devolve `job_id` para acompanhamento.

## 11. Fluxo de execução

1. Validar entrada (campos obrigatórios, tipo/tamanho dos arquivos, regras de §6, tela × proporção `original`).
2. Reduzir imagens acima de `MAX_INPUT_PIXELS` (§7.2) e enviar cada uma ao ComfyUI com `POST /upload/image`.
3. Escolher o workflow, calcular width/height, montar o grafo (§9), embrulhar o prompt se Fundo transparente (§8.2) e gerar a seed.
4. `POST /prompt` com o `client_id` do processo do backend (um só, v0.4; o navegador nunca fala com o ComfyUI) e guardar o `prompt_id`.
5. Acompanhar progresso e posição na fila por WebSocket (`/ws?clientId=...`).
6. Ao terminar, ler `/history/{prompt_id}` e baixar o resultado por `/view`.
7. Entregar a imagem à UI e limpar arquivos temporários conforme a retenção configurada.

## 12. Requisitos não funcionais

- **Segurança:** o ComfyUI não tem autenticação e permite instalar custom nodes, então **não expor a porta do ComfyUI**; só o backend fala com ele. Sem login no MVP, o app deve rodar em rede confiável; expor à internet exige proxy reverso com autenticação antes.
- **Segurança, estado real (v0.4):** o ComfyUI de produção (`https://comfy.bigode.ai`) responde sem login. Decisão do dono: manter sem login por enquanto. Risco aceito: qualquer pessoa com a URL pode enfileirar execuções na GPU e, se o ComfyUI-Manager estiver instalado, instalar custom nodes.
- **Fila:** uma geração por vez por GPU. O backend controla a fila, mostra estado/progresso (e posição, se houver outras execuções) e permite cancelar. A fila e o estado dos jobs ficam em **Redis** (BullMQ, worker com concorrência 1), para sobreviver a reinícios do backend (v0.4). Redis roda via `docker-compose.yml`.
- **Uploads:** PNG/JPG/WebP; limite de bytes e de dimensão configuráveis.
- **Erros amigáveis:** mensagens em português para falhas comuns (imagem inválida, tamanho fora do limite, ComfyUI indisponível, fila ocupada).
- **Versionamento:** cada workflow (JSON de API + arquivo de mapeamento) versionado junto, para que mudar um nó não quebre o backend silenciosamente.
- **Configuração:** `MAX_REFS` (10), `MAX_PIXELS` (4.194.304), `MAX_INPUT_PIXELS`, `MAX_REFS_TOTAL_PIXELS` (v0.4), passos por qualidade, retenção de arquivos.

## 13. Critérios de aceite

- **Gerar, sem referências, sem mexer em nada:** gera PNG 1024 × 1024 (1:1 · 1 MP) pelo workflow t2i.
- **Presets:** cada combinação da tabela de §5 gera exatamente as dimensões da tabela, e os campos aparecem bloqueados.
- **Manual:** os campos abrem; valores fora da regra de §6 são ajustados com aviso ou rejeitados; uma imagem 1280 × 736 é gerada com essas dimensões.
- **Gerar, com referências:** ao adicionar a 1ª imagem o backend passa a usar o workflow de edição; o prompt pode citar `<image1>` e `<image2>`; a ordem das imagens é respeitada; aceita 10 imagens e rejeita a 11ª.
- **Editar, Original (padrão):** nenhum seletor de resolução aparece; a saída tem as dimensões da entrada arredondadas para múltiplo de 32 (diferença ≤ 31 px por lado).
- **Editar, outra proporção ou Manual:** o backend envia `switch = true` com os valores calculados; a UI avisa quando a proporção difere da original.
- **Editar, imagem acima do limite:** a execução não estoura VRAM; a imagem é reduzida e o usuário é avisado.
- **Qualidade:** "Alta" executa com mais passos que "Normal" e demora mais.
- **Fundo transparente (Gerar e Editar):** com o checkbox ligado, o PNG resultante tem canal alfa e **pelo menos 5% dos pixels com alfa menor que 16** (verificável por script; v0.4: "alfa < 255" não basta, porque imagens opacas do modelo também têm alfa ruidoso), e o preview mostra fundo xadrez. Desligado, o prompt chega ao ComfyUI sem alteração e o PNG entregue não tem canal alfa.
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

**Decisões tomadas (v0.4, revisão do plano)**
8. Imagem de entrada pequena: ampliada até o menor lado = `MIN_SIDE`, com aviso (§7.2).
9. `image_1` ajustada pelo backend a múltiplo de 32 (`floor32`, recorte central) antes do envio; "Original" mostra a saída exata (§7.2).
10. Manual: proporção máxima 1:4 (`MAX_ASPECT_RATIO`); a UI arredonda com aviso e o backend rejeita o inválido (§6).
11. Fila e estado dos jobs em Redis (BullMQ), Redis via `docker-compose.yml`, `REDIS_URL` na configuração (§12).
12. Redimensionamento com **sharp** (a v0.3 dizia Pillow; a stack é Node).
13. Um único `client_id` por processo do backend (§11).
14. A função pura de tamanho (§5/§6) e o teste da tabela entram no Marco 1 (o backend precisa dela); o Marco 2 fica com a tela.
15. ComfyUI em `https://comfy.bigode.ai`, **sem login** por decisão do dono (risco em §12).
16. Menções a imagens: a UI insere `[Imagem N]` no texto (botão @ em cada miniatura) e renumera ao reordenar/remover; o backend converte `[Imagem N]` → `<imageN>` só quando há imagens. `<imageN>` digitado também funciona.
17. Limite total de pixels das imagens de um pedido (`MAX_REFS_TOTAL_PIXELS`), ver resultados do Marco 3.
18. **Avançado removido** (a pedido do dono, após o MVP): a seed não aparece mais na interface nem no contrato da API; é sempre aleatória. Quem precisar reproduzir um resultado para depuração usa `scripts/spikes/m1.ts`, que fixa a seed.
19. **Mobile e PWA** (após o MVP): layout validado em 360, 390 e 412 px (sem rolagem horizontal; alvos de toque ≥ 40 px no celular; campos com fonte de 16 px; painel do resultado entra na tela ao gerar). PWA instalável: `manifest` (abre em `/gerar`, `standalone`, tema `#ffc87c`), ícones e favicon gerados de `docs/icons/icon_warm.png` (`pnpm icons`, com versão *maskable*), e um service worker mínimo (`public/sw.js`) que só guarda a página "sem conexão": nada da API nem dos assets do Next é cacheado. Instalar exige HTTPS (ou `localhost`).
20. **Código em inglês e i18n** (após o MVP): rotas `/generate` e `/edit` (as antigas `/gerar` e `/editar` redirecionam com 308); todo o código e comentários em inglês. Textos da interface em `src/i18n/messages/{en,pt-BR}.ts`, chaves em inglês, pt-BR padrão, EN quando o navegador pede ou pelo seletor PT | EN (cookie `locale`). A API devolve só códigos + parâmetros (`errors.*`, `details.*`, `warnings.*`); o front traduz. Menções aceitam `[Imagem N]` e `[Image N]`.
21. **Ícones e telas de abertura** (após o MVP): `pnpm icons` gera, a partir de `docs/icons/icon_warm.png` e `docs/icons/logo.png`, o `favicon.ico` (16/32/48), favicons PNG, 10 ícones Android (48–512), 2 *maskable* (192/512), 4 `apple-touch-icon` (120/152/167/180) e 19 telas de abertura do iOS (retrato, iPhone SE 1 até iPhone 16 Pro Max e iPads), cada uma com a media query exata do aparelho. Lista única em `src/lib/pwa-assets.ts`, conferida por teste.
22. **Configurações, tema e idiomas** (após o MVP): engrenagem no cabeçalho com Tema (Claro/Escuro; **escuro é o padrão**) e Idioma com bandeiras. Idiomas: pt-BR, en-US, es-MX e zh-CN (chinês simplificado). Escolha automática pelo navegador, na ordem de preferência dele, por idioma: todo `pt-*` → pt-BR, `es-*` → es-MX, `en-*` → en-US, `zh-*` (inclusive zh-TW/zh-HK) → zh-CN; idioma não suportado → en-US. Preferências salvas em cookies no navegador (`locale`, `theme`, 1 ano) para o servidor já renderizar certo, sem piscar. Traduções es-MX e zh-CN feitas por IA: vale revisão de um falante nativo.
23. **Melhorar texto e Estilo** (após o MVP; mockups aprovados em 2026-09-25, opção A + "Campo Estilo"):
    - **Estilo:** campo "Estilo → Nenhum + [Escolher estilo]"; escolhido, "Estilo → nome + [Trocar] + [✕]". Escolher abre a lista completa (busca, categorias, miniaturas). 51 estilos em 10 categorias, baseados no `comfyui-llm-prompt-enhancer` (pinkpixel-dev), nomes com marca mantidos ("Estilo Ghibli", "Castelo animado"). Cada estilo tem uma frase fixa em inglês (`src/lib/styles.ts`), aplicada pela etapa final (decisão 24). Miniaturas em `public/styles/` geradas pelo próprio app com `pnpm styles:thumbs`: o ícone (`docs/icons/icon_warm.png`) redesenhado em cada estilo pela tela Editar, pelo mesmo fluxo do usuário (quadrado e com fundo, melhor que o `logo.png` recortado e transparente).
    - **Melhorar texto** (simplificado em 2026-09-25, a pedido do dono: o cartão de sugestão com Usar/Descartar e "Voltar ao meu texto" era complicado e não deixava melhorar de novo): botão sempre disponível abaixo do texto; um LLM (LiteLLM, API compatível com OpenAI, modelo `prompt-enhancer`, `LLM_URL`/`LLM_API_KEY`/`LLM_MODEL`) reescreve a ideia com mais detalhes, **no idioma do usuário**, direto no campo (até 40 palavras). Aparece "Texto melhorado · Desfazer" (volta 1 passo); digitar esconde o Desfazer. Dá para melhorar de novo o texto já melhorado. A tradução para inglês acontece só na etapa final (decisão 24), então o que está na tela é o que vai. Sem `LLM_URL` o botão não aparece.
    - **Limites do modelo** (ajustados no LiteLLM em 2026-09-25; contexto real de 8K): `max_input_tokens` 4096, `max_output_tokens` 1024, `max_tokens` 800, `presence_penalty` 0.3 (1.5 punia repetir as menções). No app: `LLM_MAX_OUTPUT_TOKENS` (800) e `LLM_MAX_INPUT_CHARS` (4000, o mesmo limite do texto); textos maiores pulam o LLM.
    - **Menções e formato:** o texto vai com as menções como o usuário as vê (`[Imagem 1]`, `[Image 1]`, `[Imagen 1]`, `[图片 1]`), que o modelo preserva melhor que `<image1>`, e a instrução **lista as menções exatas** que precisam aparecer. A resposta é **texto puro** (com JSON o modelo errava as aspas, ex. `{"text: "…`); JSON ainda é aceito se vier. Colchetes perdidos são repostos. Validação: mesmas imagens mencionadas, nenhuma inventada; até 3 tentativas, depois `enhance_failed`. Erro de rede/HTTP → `enhance_unavailable`. Medido: 7/10 com JSON e só "copie as menções"; 10/10 com texto puro, lista explícita e novas tentativas (2,4–4,9 s).
    - **Descoberta (2026-09-25, miniaturas):** com a frase do estilo **no fim** do prompt, o modelo quase não muda o visual quando há uma imagem de referência forte: ~1/3 dos estilos saíram quase iguais ao ícone. Uma instrução que **começa** pelo estilo, no formato "Turn <image1> into <estilo>", funciona bem melhor (ukiyo-e continua fraco em todos os formatos testados). Isso levou à decisão 24.
24. **Etapa final de prompt em toda geração** (pedido do dono, 2026-09-25): independente das escolhas, o worker passa o texto pelo LLM `prompt-enhancer` antes de montar o grafo:
    - traduz para inglês **fielmente** (sem acrescentar nem tirar detalhes; o "Melhorar texto" continua sendo a opção de detalhar);
    - mantém as referências como `<imageN>` (valida: nenhuma perdida, nenhuma inventada; `image1` sem sinais é corrigido);
    - com estilo, começa pelo estilo: com imagens (inclusive na tela Editar sem menção escrita), "Turn <image1> into <estilo>…"; sem imagens, "A <estilo> of…". Valida que uma palavra-chave do estilo aparece **nos primeiros 100 caracteres** (no fim ele quase não muda a imagem) e que nenhuma referência passa do número de imagens do job.
    - instruções de edição continuam instruções ("troque o fundo por uma praia" → "Replace the background with a beach").
    - Parte do texto que está na tela (inclusive se ele veio do "Melhorar texto").
    - Roda na fase "Preparando o gerador…" (~1–2 s). O prompt final fica salvo no job, para uma nova tentativa mandar o mesmo texto.
    - **Sem LLM, texto acima de `LLM_MAX_INPUT_CHARS`, LLM fora ou resposta inválida (após 1 nova tentativa):** a geração segue com o caminho antigo (menções convertidas e frase do estilo no fim) e registra no log.
    - Depois dela vem o fundo transparente (§8.2), igual a antes.
25. **Máquina do ComfyUI com Wake-on-LAN** (2026-09-25): a máquina fica desligada e liga com a primeira requisição ao endpoint, levando ~10 s para responder. Antes, a checagem de saúde desistia em 5 s e o aviso "gerador fora do ar" aparecia mesmo com ele funcionando. Medido também: durante uma geração pesada, `/system_stats` levou até ~4,8 s, no limite dos 5 s.
    - `COMFY_WAKE_SECONDS` (padrão 30): `/api/health` e o worker (antes de cada job) tentam `/system_stats` a cada 2 s, com até 10 s por tentativa, até esse limite.
    - Na tela, se a checagem demora mais de 1 s, aparece "Conectando ao gerador de imagens… pode levar até 30 segundos"; o erro só aparece depois do limite.
26. **Visual "Ateliê noturno"** (mockup A aprovado em 2026-09-25): tema escuro padrão com fundo quente `#120F0D` e destaque damasco `#FFB870` (do fundo do ícone); tema claro creme `#FBF6EE` com destaque caramelo `#A65A17` (contraste de texto). Títulos em Bricolage Grotesque, resto em Geist. Ícones de ação para Gerar (imagem + brilho) e Editar (imagem + lápis); o gato siamês aparece só nos estados do painel de resultado: dormindo (vazio/cancelado), abrindo um olho (conectando), de olho na barra com o rabo balançando (gerando; as pupilas seguem o % real), orelhas baixas (erro, com "Tentar de novo"). O resultado entra com fade de 300 ms depois de carregar. Com movimento reduzido, rabo, piscada e "zzz" param. Ícones em `src/components/icons.tsx`.
27. **Docker** (2026-09-25): `Dockerfile` multi-stage (`node:24-slim`, Next standalone com `NEXT_OUTPUT=standalone`, usuário não-root, ~420 MB), com `workflows/api` copiado para a imagem. `docker-compose-dev.yml` gera a imagem `ghcr.io/wdonega/bigos-image:latest` (e sobe o Redis usado pelo `pnpm dev`); `docker-compose.yml` roda a imagem gerada + Redis. Só `COMFY_URL` é obrigatória; `LLM_URL`/`LLM_API_KEY` opcionais; os limites viraram padrões em `config.ts`. Volumes `storage` (resultados/uploads) e `redis-data`. O healthcheck usa `/manifest.webmanifest` e **não** `/api/health`, que acordaria a máquina do ComfyUI a cada checagem. Verificado contra o container: `pnpm smoke`, `pnpm acceptance` 10/10, "Melhorar texto", miniaturas e resultado sobrevivendo a um restart. Publicação: GitHub Actions (`.github/workflows/docker.yml`) gera linux/amd64 e linux/arm64 (ARM por emulação QEMU) e publica no GHCR com a revisão do commit (curta e completa), `latest` na branch principal e a versão em tags `v*`; mudanças só de documentação (`**.md`, `docs/**`) não disparam.

**Descobertas (v0.4)**
- **Exports de API corrigidos à mão (2026-09-25):** os JSONs em `workflows/api/` vieram sem os títulos `@…` e, no edit, com `ResolutionSelector`, `ImageCompare` e um 2º `LoadImage`. Com autorização do dono, os títulos foram adicionados e esses nós removidos direto no JSON (sem reexportar); `width`/`height` do edit ficaram como valores (1024 × 1024). `check-workflows.mjs` passa.
- **`resolution` também existe no t2i** (valor `1024` no export), ao contrário do que dizia §9.2. Pelo tooltip do nó (abaixo), ele só redimensiona imagens de referência; sem imagens não tem efeito. O backend não mexe nele no t2i.
- **`resolution` (tooltip do nó, `GET /object_info`):** "Reference images are resized to about resolution x resolution pixels, at multiples of 32, preserving aspect ratio. 0 keeps each reference at its own size, rounded to a multiple of 32." Faixa 0–4096, passo 32. Ou seja: é um orçamento em pixels (1024 ≈ 1 MP), e `0` confirma o comportamento de §7. Falta confirmar se o arredondamento é para cima, para baixo ou ao mais próximo (irrelevante depois da decisão 9).
- **Entradas de imagem:** `images` é um `COMFY_AUTOGROW_V3` com nomes `image_1` … `image_16` (mínimo 0). No JSON de API aparecem como `images.image_N`. O nó aceita 16; o app limita a `MAX_REFS` (10).

**Resultados dos spikes do Marco 1 (2026-09-25, ComfyUI 0.37.0 em `comfy.bigode.ai`, seed 42, 25 passos; script `scripts/spikes/m1.ts`)**
- **Limite "2048" → é orçamento de pixels, não lado.** 2048 × 2048, 2720 × 1536 e 1536 × 2720 geraram sem erro e sem duplicação/deformação visível (~125 s cada). Os presets de 4 MP do §5 ficam como estão.
- **VRAM:** sem OOM em nenhum caso de 4 MP. `vram_free` oscila entre 1,3 e 6,7 GB entre execuções (o ComfyUI descarrega/recarrega modelos), então não serve como medida fina; os limites `MAX_PIXELS = MAX_INPUT_PIXELS = 4 MP` ficam. Falta medir edição com 10 referências (Marco 3).
- **Tempo:** 1 MP ≈ 18 s; 4 MP ≈ 125 s (25 passos, GPU livre). A 1ª execução após ociosidade leva ~35 s (carga dos modelos).
- **Prompts em português:** 3 pares PT × EN com a mesma seed deram qualidade equivalente (inclusive texto "Café do Zé" renderizado no PT). Não é preciso tradução.
- **Alfa ponta a ponta (t2i):** `SaveImageAdvanced` + `/view` preservam o alfa. Com o embrulho, 59–73% dos pixels ficam com alfa < 16 e o recorte é limpo. **Sem o embrulho a saída também é RGBA**, com alfa entre 204 e 255 em 10–40% dos pixels (ruído) → decisão v0.4 de remover o alfa quando o checkbox está desligado (§8.2) e critério de aceite ajustado (§13).
- **Embrulho em inglês + prompt em português:** mesma fração de transparência que o prompt em inglês (59% vs 60%; 72,5% vs 73%). Sem impacto.
- **Qualidade (Marco 2):** 1 MP, mesma seed: Normal (25 passos) 17,9 s; Alta (40 passos) 26,6 s (+49%).
- **Saída no `/history`:** `outputs["<id do @save>"].images[0] = { filename, subfolder, type: "output" }`.

**Resultados dos spikes do Marco 3 (2026-09-25; script `scripts/spikes/m3.ts`, pela API do app)**
- **`resolution = 0` / Original:** com a `image_1` já ajustada a múltiplo de 32 pelo backend (decisão 9), a saída tem **exatamente** o tamanho enviado: 1000×750 → 992×736; 3000×2000 → reduzida a 2496×1664 (saída igual, 249 s); 300×300 → ampliada a 512×512.
- **Injeção de imagens:** o grafo dinâmico (clonar `@image_1`, ligar `images.image_N`) funciona com 2 e com 10 imagens; o ComfyUI aceita os ids de nó gerados (`470_image_2` …). Com 10 referências o modelo colocou todos os objetos na cena. **Não precisa de um JSON por quantidade.**
- **VRAM com referências → divergência, limite novo.** 10 referências de ~4 MP (≈ 42 MP no total) estouram a memória no `TextEncodeQwenImage21` ("Allocation on device 0 would exceed allowed memory"). 10 × 1 MP (10 MP) funciona (267 s); 10 × 2 MP (≈ 20 MP) passa do encoder, mas estoura o `JOB_TIMEOUT_MINUTES` de 15 min (o app interrompe corretamente). **Decisão v0.4:** novo limite `MAX_REFS_TOTAL_PIXELS` (padrão 10.485.760 = 10 × 1 MP) para a soma dos pixels de todas as imagens de um pedido; acima dele o backend reduz todas pelo mesmo fator (múltiplos de 32) e avisa o usuário no resultado. Precisa ser ≥ `MAX_INPUT_PIXELS`, para a Editar (1 imagem) nunca ser afetada.
- **Referência com proporção diferente do tamanho pedido:** referência 16:9 com saída 9:16 → o modelo recompõe a cena na proporção pedida (sem esticar).
- **Editar com outra proporção:** o modelo **reenquadra** a cena, não estica: em 1:1 afasta, em 16:9 aproxima e corta, em 9:16 estende parede e chão; o objeto perde parte da fidelidade (é redesenhado). Como o enquadramento é decidido pelo modelo, uma prévia não seria fiel → **basta o aviso** na UI.
- **Observação aberta (qualidade do modelo, não do pipeline):** com 2 referências (coruja em fundo branco + cafeteria), em qualquer ordem e com prompts em PT e EN, o modelo devolveu a cafeteria sem a coruja; os grafos enviados estavam corretos (conferido no `/history`). Com 10 referências a coruja apareceu. Vale testar mais combinações antes de prometer "juntar duas imagens" na UI.

**Resultados do spike do Marco 4 — transparência na edição (2026-09-25; `scripts/spikes/m4.ts`)**
- **Funciona quando a `image_1` já é um objeto/personagem sobre fundo simples:** coruja em fundo claro (Editar "chapéu de mago", Gerar com 1 e 2 referências) → 65–69% dos pixels com alfa < 16, recorte limpo.
- **Não funciona em fotos com cenário completo:** bicicleta na parede → 0% transparente, com PT, EN e instrução explícita ("keep only the bicycle… remove the wall"). Além disso o embrulho **piora** a foto (cores lavadas, aspecto "HDR") e a edição pedida pode ser ignorada.
- **Comportamento implementado (provisório, v0.4):** o checkbox continua nas duas telas; na Editar o texto de ajuda explica o limite; o backend mede o resultado e, se foi pedida transparência e menos de 5% dos pixels ficaram transparentes, avisa o usuário ("Não foi possível deixar o fundo transparente nesta imagem…").
- **Decisão pendente do dono (§8.2 previa isto):** (a) manter como está; (b) tirar o checkbox da Editar; (c) no MVP, remover o fundo por pós-processamento (fora do escopo atual e exige dependência nova).

**Checklist do §13 (Marco 4, 2026-09-25)** — `pnpm acceptance` roda os itens marcados com (auto) contra o app e o ComfyUI reais: 10/10 passaram.
- ✅ Gerar sem mexer em nada → PNG 1024 × 1024 pelo t2i (auto; t2i garantido pelo teste de `planJob`).
- ✅ Presets: as 21 combinações conferidas por teste unitário contra a tabela do §5; geração real conferida em 1024², 2048², 2720×1536, 1536×2720, 1376×768, 768×1376 e 1920×1088 (Marcos 1–3). Nem todas as 21 foram geradas de verdade (custo de GPU). Campos bloqueados: conferido no navegador.
- ✅ Manual: campos abertos, arredondamento com aviso ao sair do campo, backend rejeita inválido (auto); 1280 × 736 gerado (auto e no navegador).
- ✅ Gerar com referências: workflow de edição a partir da 1ª imagem (teste de `planJob`); `<image1>`/`<image2>` e ordem respeitada no grafo (conferido no `/history`); 10 aceitas (spike M3) e 11ª rejeitada (auto e no navegador).
- ✅ Editar, Original: sem seletor de resolução (navegador); saída = dimensões enviadas, ≤ 31 px de diferença da original (auto).
- ✅ Editar, outra proporção/Manual: `switch = true` com os valores calculados (teste de `buildEdit` + spike M3); aviso de proporção diferente (navegador).
- ✅ Editar, imagem acima do limite: reduzida com aviso (auto), 4 MP de edição sem estourar VRAM (spike M3).
- ✅ Qualidade: Alta = 40 passos, +49% de tempo (Marco 2).
- ✅ Fundo transparente: Gerar e Editar com objeto em fundo simples ≥ 5% alfa < 16 (auto); preview xadrez (navegador); desligado → prompt inalterado (teste) e PNG sem alfa (auto). ⚠️ Em fotos com cenário, a Editar não fica transparente (ver acima).
- ✅ Geral: duas execuções sem seed diferem (auto); com a GPU ocupada o 2º pedido mostra "Na fila" com 1 na frente (auto e no navegador).
- **Não verificado:** Playwright (opcional na stack, não adicionado para evitar dependência); navegadores além do Chrome; tema escuro.

**A definir**
- **Rótulos e padrões:** Pequeno / Médio / Grande e o padrão 1 MP são sugestões; "Alta" = 40 passos é proposta.
- **Original com resolução:** hoje "Original" mantém as dimensões e esconde a resolução. Permitir "proporção da imagem + 1/2/4 MP" (para ampliar mantendo a proporção) é possível, mas fica fora por enquanto.

**A validar em teste**
- ✅ *(Marco 1: orçamento de pixels; ver resultados acima)* **Limite "2048":** se as notas do template significam 2048 por lado ou 2048² em pixels. Se for por lado, os presets 16:9 e 3:2 de 4 MP (lado de 2720 e 2496) precisam de outro cálculo.
- ✅ *(Marco 3: saída exata com a imagem pré-ajustada)* **`resolution = 0`:** que realmente não redimensiona (além do múltiplo de 32) com imagens de tamanhos variados.
- ✅ *(Marco 3: grafo dinâmico funciona com até 10)* **Injeção de imagens:** nomes reais de `images.image_N` no JSON de API e se o grafo dinâmico de §9.3 funciona; senão, um JSON por quantidade.
- ✅ *(removido; `width`/`height` são valores simples nos dois JSONs)* **`ResolutionSelector`:** se removê-lo deixa `width`/`height` como valores simples no export.
- ✅ *(Marco 3: novo limite `MAX_REFS_TOTAL_PIXELS`)* **VRAM:** limites reais de `MAX_PIXELS` e `MAX_INPUT_PIXELS`, incluindo 10 referências e o preset de 4 MP.
- ✅ *(Marco 1: qualidade equivalente)* **Prompts em português:** os exemplos dos templates são em inglês; testar e, se a qualidade cair, considerar tradução automática.
- ✅ *(Marco 3: recompõe)* **Proporção diferente de `image_1`:** comportamento quando a tela Gerar usa referências com proporção distinta do tamanho pedido.
- ✅ *(Marco 1: funciona no t2i)* **Alfa ponta a ponta:** se `SaveImageAdvanced` e `/view` preservam o canal alfa e se o prompt embrulhado produz mesmo fundo transparente no t2i (é o único workflow em que o template descreve isso).
- ⚠️ *(Marco 4: só com objeto em fundo simples; decisão pendente)* **Transparência na edição:** se o embrulho funciona no workflow de edição, inclusive com referências. Se não funcionar, o checkbox fica só na tela Gerar ou a Editar passa a usar outra formulação.
- ✅ *(Marco 3: reenquadra; basta o aviso)* **Editar com proporção diferente da original:** se o modelo recorta, estica ou desloca o conteúdo. Isso decide se basta o aviso ou se a UI precisa mostrar uma prévia do enquadramento **(proposta)**.
- ✅ *(Marco 1: sem impacto)* **Embrulho em inglês com prompt em português:** se a mistura afeta a qualidade ou a transparência.

**Futuro (fora do MVP):** autenticação e histórico por usuário.

## 15. Referências

- Template t2i: `image_qwen_image_2_1_t2i.json` (Comfy-Org/workflow_templates)
- Template edição: `image_qwen_image_2_1_image_edit.json` (Comfy-Org/workflow_templates)
- Modelos: https://huggingface.co/Comfy-Org/Qwen-Image-2.1
