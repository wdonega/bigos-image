# Gerador de imagens (ComfyUI + Qwen Image 2.1)

## Como rodar

Precisa de Node.js ≥ 24, pnpm, Docker (para o Redis da fila) e um ComfyUI com os modelos da spec §9.4.

```bash
cp .env.example .env        # ajuste COMFY_URL
pnpm install
pnpm redis                  # sobe o Redis (docker compose)
pnpm dev                    # http://localhost:3000 → telas Gerar e Editar
```

Produção: `pnpm build && pnpm start` (servidor Node persistente; o worker da fila roda no mesmo processo).

Verificação: `pnpm test` (unitários), `pnpm typecheck`, `pnpm lint`, `pnpm check:workflows`, e com o app rodando `pnpm smoke` (1 geração) ou `pnpm acceptance` (critérios do §13, ~4 min de GPU).

---

Pacote inicial para construir o projeto com o Claude Code. A definição do produto está em `docs/spec.md`; as regras de trabalho do Claude estão em `CLAUDE.md`.

```
bigos-image/
├── CLAUDE.md                 regras, stack, marcos
├── README.md                 este arquivo
├── .env.example              limites e configuração
├── docs/spec.md              especificação (v0.4)
├── scripts/check-workflows.mjs   valida os JSONs exportados
└── workflows/
    ├── README.md             como exportar e convenção de títulos
    ├── templates-ui/         templates originais (referência)
    └── api/                  seus exports em API format (t2i_api.json, edit_api.json)
```

## Antes de chamar o Claude Code

- [ ] **ComfyUI** atualizado, com os modelos da spec §9.4, rodando e acessível. Copie `.env.example` para `.env` e ajuste `COMFY_URL`.
- [ ] **Exportar os dois workflows** em API format seguindo `workflows/README.md` e conferir com `node scripts/check-workflows.mjs`.
- [ ] **Node.js LTS e pnpm** instalados.
- [ ] **Stack:** o `CLAUDE.md` assume Next.js + TypeScript. Se preferir outra, troque a seção "Stack" antes de começar.

## Como começar

```bash
cd bigos-image
git init && git add -A && git commit -m "chore: initial package"
claude
```

Sugestão de modelos (confira o que o seu plano inclui): use o mais forte disponível, como o Opus 5.5, para o plano e para o marco 1 (o grafo dinâmico do ComfyUI é a parte mais traiçoeira), e o Sonnet 5 para os marcos seguintes. Troque no meio com `/model`.

### 1. Plano, sem código (modo de plano: Shift+Tab)

```
Leia CLAUDE.md, docs/spec.md e workflows/. Não escreva código ainda.
1) Liste ambiguidades e riscos que você enxerga na spec.
2) Proponha a arquitetura (pastas, módulos, rotas) e confirme a divisão em marcos do CLAUDE.md.
3) Para cada item de "A validar em teste" (§14), proponha um spike curto e diga em que marco entra.
Espere minha aprovação antes de implementar.
```

### 2. Marco 1

```
Implemente o Marco 1 do CLAUDE.md: cliente do ComfyUI e texto para imagem de ponta a ponta contra o ComfyUI em COMFY_URL.
Faça os spikes previstos para este marco e registre os resultados em docs/spec.md §14.
Ao terminar: rode os testes, faça um commit e me diga como testar manualmente. Pare aí.
```

### 3. Marcos 2, 3 e 4

Use `/clear` entre os marcos (o `CLAUDE.md` e a spec dão o contexto) e peça um por vez:

```
Implemente o Marco N do CLAUDE.md. Siga a definição de pronto e pare ao terminar.
```

### Dicas

- Revise o diff de cada marco antes de aprovar o próximo.
- Se o Claude propuser mudar a spec, leia a mudança: a spec é o contrato do projeto.
- Se o ComfyUI não estiver acessível de onde o Claude Code roda, peça para ele usar um ComfyUI simulado (mock) nos testes e me avisar quais partes ficaram sem verificação real.
