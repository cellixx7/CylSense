# CYL Sense - Guia para o Claude Code

Plataforma de coaching para gamers: estatisticas dizem **o que** aconteceu, video ajuda a avaliar **como**, e o coaching aponta **o que treinar**.

## Decisoes fixas (P0)

- Plataforma: desktop Windows (Tauri 2).
- Front-end: React + TypeScript (strict) + Tailwind CSS + shadcn/ui.
- Persistencia: SQLite local com migracoes (P0-03).
- Video: importacao manual de MP4 (sem gravacao automatica).
- IA: hibrida e opt-in. P0 funciona 100% offline, sem API paga.
- Arquitetura: monolito modular, local-first.

## Regras inegociaveis

- Nunca ler memoria do jogo, contornar o Vanguard, usar endpoints nao autorizados da Riot ou dar assistencia tatica em tempo real.
- Nunca embutir segredo/chave de API no bundle desktop. IA externa so via gateway/backend seguro (futuro).
- Usar somente fixtures sinteticas; nunca apresentar dado inventado como resultado real.
- Todo `Finding` deve ter evidencia rastreavel e distinguir `fact` de `hypothesis`.
- Validar toda entrada externa (Zod). TypeScript `strict` sempre ligado.

## Estrutura

```
apps/desktop/        # Tauri 2 + React (shell, UI)
  src/               # front-end
  src-tauri/         # Rust / comandos Tauri
packages/            # core, game-adapters, analytics, coaching (a partir do P0-02)
fixtures/valorant/   # dados sinteticos
docs/{architecture,decisions,compliance}/
```

## Comandos

```bash
pnpm install
pnpm dev:web        # so o front-end no navegador
pnpm dev            # app Tauri (requer Rust + WebView2 no Windows)
pnpm typecheck
pnpm test
pnpm build:web
pnpm build          # instalador (rodar no Windows)
```

## Fluxo de trabalho

- Inspecionar a pasta antes de modificar arquivos.
- Fazer apenas a tarefa do backlog pedida; nao avancar sem autorizacao.
- Ao final de cada tarefa relatar: Implementado, Arquivos, Testes, Pendencias, Proximo passo.
- Evitar releituras desnecessarias, refatoracoes fora do escopo e testes completos a cada alteracao.

## Status do backlog

- [~] P0-01 Bootstrap do desktop: verificado no Linux (typecheck, testes, build web, cargo check/clippy, binario nativo); falta validar `pnpm dev` e `pnpm build` no Windows (ver docs/architecture/p0-01-aceite.md)
- [ ] P0-02 Contratos e dominio
- [ ] P0-03 SQLite
- [ ] P0-04 Importacao
- [ ] P0-05 Analytics Engine
- [ ] P0-06 Dashboard
- [ ] P0-07 Video manual
- [ ] P0-08 Coaching local
- [ ] P0-09 Qualidade e build
