# CLAUDE.md — Bigos Image - Gerador de imagens (ComfyUI + Qwen Image 2.1)

Aplicação web simples para leigos gerarem e editarem imagens com workflows do ComfyUI. O escopo, as telas, as regras de tamanho, o mapeamento de nós e os critérios de aceite estão em **`docs/spec.md`**. Leia a spec inteira antes de qualquer trabalho.

## Regras de trabalho

1. **A spec é a fonte de verdade.** Se a realidade divergir dela (um nome de input do ComfyUI, um limite, um comportamento do modelo), **pare, registre a divergência em `docs/spec.md` §14 e me avise** antes de seguir em frente. Não contorne em silêncio.
2. **Não invente nomes de nós ou de inputs do ComfyUI.** Leia `workflows/api/*.json` (exportados em API format). `workflows/templates-ui/` são os templates originais em formato de UI (com subgraph), só para referência.
3. **Localize nós por `_meta.title`** (convenção `@prompt`, `@latent_size`, `@sampler`, `@custom_size`, `@image_1`, `@save`), nunca por ID. Ver `workflows/README.md`.
4. **Trabalhe por marcos** (abaixo). Ao terminar cada um: rode os testes, faça um commit e **pare** para eu revisar. Não comece o marco seguinte sem eu pedir.
5. **Peça antes de adicionar dependências relevantes.** Prefira poucas dependências.
6. Antes de declarar algo pronto, **rode e confira** (testes, e o fluxo real contra o ComfyUI quando houver). Diga o que você não conseguiu verificar.

## Stack (padrão; troque aqui se preferir outra)

- TypeScript full-stack: **Next.js** (App Router) com rotas de API como backend, **Tailwind + shadcn/ui** na interface, **Zod** para validar payloads, **Vitest** para testes, **Playwright** para o fluxo de ponta a ponta (opcional).
- Node.js LTS atual e **pnpm**. Use as versões estáveis mais recentes das bibliotecas.
- Imagens: **sharp** para redimensionar entradas grandes e para checar o canal alfa nos testes.
- **Todo o código em inglês**: nomes, rotas (`/generate`, `/edit`), comentários, logs e commits. Textos da interface **só via i18n** (`src/i18n/messages/{en-US,pt-BR,es-MX,zh-CN}.ts`, chaves em inglês, `en-US` é a referência e o fallback; toda chave nova entra nos 4 arquivos); nenhum texto de UI no código. O backend responde **códigos + parâmetros** (`errors.*`, `details.*`, `warnings.*`) e o front traduz. Sem jargão técnico para o usuário (a seed é sempre aleatória e não aparece; passos só via Qualidade).

## Comandos

```bash
pnpm install              # dependências
pnpm redis                # sobe o Redis da fila (docker-compose-dev.yml)
pnpm dev                  # app em http://localhost:3000 (o worker da fila sobe junto)
pnpm test                 # testes unitários (Vitest)
pnpm typecheck            # next typegen + tsc
pnpm lint                 # ESLint
pnpm build && pnpm start  # produção (servidor Node persistente; não é serverless)
docker compose -f docker-compose-dev.yml build   # gera a imagem Docker (ghcr.io/wdonega/bigos-image:latest)
COMFY_URL=… docker compose up -d                 # roda a imagem gerada + Redis (só COMFY_URL é obrigatória)
pnpm check:workflows      # valida workflows/api/*.json
pnpm smoke                # ponta a ponta pela API (precisa do app rodando e do ComfyUI)
pnpm smoke:video          # 1 vídeo de 5 s de ponta a ponta (--refs: com uma referência)
pnpm acceptance           # critérios do §13 contra o app e o ComfyUI reais (~4 min de GPU)
pnpm icons                # regera favicon/ícones/PWA a partir de docs/icons/icon_warm.png
pnpm styles:thumbs        # gera as miniaturas que faltam em public/styles/ (app rodando + ComfyUI; --force refaz todas)
node --env-file=.env scripts/spikes/m1.ts [filtro]   # spikes contra o ComfyUI real
```

O worker da fila sobe uma vez por processo (`src/instrumentation.ts`) e **não é recarregado pelo HMR**: depois de mudar `src/lib/jobs/worker.ts` ou algo que ele importa, reinicie o `pnpm dev`.

Código em `src/lib/` usa imports relativos com extensão `.ts` (para rodar direto no Node nos scripts); em `src/app/` use `@/lib/...`.

## Configuração (`.env`, ver `.env.example`; só `COMFY_URL` e `REDIS_URL` são obrigatórias, o resto tem padrão em `src/lib/config.ts`)

`COMFY_URL`, `COMFY_WAKE_SECONDS`, `REDIS_URL`, `STORAGE_DIR`, `MAX_REFS`, `MAX_PIXELS`, `MIN_SIDE`, `MAX_ASPECT_RATIO`, `MAX_INPUT_PIXELS`, `MAX_REFS_TOTAL_PIXELS`, `MAX_UPLOAD_MB`, `RETENTION_HOURS`, `JOB_TIMEOUT_MINUTES`, `STEPS_NORMAL`, `STEPS_HIGH`, `VIDEO_PIXELS_NORMAL`, `VIDEO_PIXELS_HIGH`, `MAX_VIDEO_REFS`, `VIDEO_JOB_TIMEOUT_MINUTES`, e opcionais `LLM_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_MAX_OUTPUT_TOKENS`, `LLM_MAX_INPUT_CHARS` (Melhorar texto e etapa final; a chave só no `.env`). Nunca deixe limites fixos no código: leia da configuração.

## Arquitetura (resumo; detalhes na spec)

- O navegador fala **só com o backend**. O ComfyUI nunca é exposto ao navegador.
- Backend: valida a entrada, calcula o tamanho, escolhe o workflow pela quantidade de imagens, monta o grafo, envia ao ComfyUI (`/upload/image`, `/prompt`, WebSocket `/ws`, `/history`, `/view`), controla a fila e devolve o progresso e o resultado ao front.
- **Cálculo de tamanho** (proporção + resolução → largura × altura) é uma **função pura**, testada contra a tabela do §5 da spec. O backend recalcula e valida; não confia no par enviado pelo front.
- Termos: **Resolução** = megapixels (Pequeno/Médio/Grande); **Qualidade** = passos (Normal/Alta); `resolution` no código do ComfyUI é outra coisa (parâmetro interno do encoder, fixo em `0`).

## Marcos

1. **Cliente do ComfyUI + texto para imagem de ponta a ponta**, ainda sem interface elaborada. Inclui os spikes dos itens de "A validar em teste" (§14) que afetam esse marco.
2. **Tela Gerar** com o seletor de tamanho (proporção + resolução, Manual), Qualidade. Teste unitário da tabela do §5.
3. **Referências e tela Editar:** grafo dinâmico com até 10 imagens, Original, troca de proporção, redução de imagens grandes.
4. **Fundo transparente** em todas as telas, preview xadrez, acabamento, mensagens de erro e checklist do §13 da spec.

## Definição de pronto de cada marco

Testes passando, critérios de aceite do §13 relevantes para o marco verificados (ou marcados como não verificados, com o motivo), spec atualizada com o que foi descoberto e um commit com mensagem clara.
