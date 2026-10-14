# CYL Sense - Guia para o Claude Code

Plataforma de analise de desempenho para jogadores (VALORANT primeiro): estatisticas dizem **o que** aconteceu, o video ajuda a avaliar **como**, e o coaching aponta **o que treinar**.

Tres produtos (ADR 0002): **Web** (institucional, login, analises iniciais), **Desktop** (ferramenta principal, local-first) e **API** (autenticacao, Riot, sincronizacao).

## Decisoes fixas

- Desktop Windows: Tauri 2 + React + TypeScript strict + Tailwind + shadcn/ui; funciona offline.
- SQLite local via rusqlite em comandos Rust tipados (ADR 0004): o front-end nunca envia SQL; migracoes so aditivas e nunca editadas depois de publicadas. PostgreSQL so na API (futuro).
- Web: Next.js (App Router) + Tailwind; fala so com `/api/*` (proxy para a API, cookie httpOnly).
- API: Node + Fastify + Zod, contratos versionados `/v1`; estado em memoria hoje, PostgreSQL no futuro.
- Contratos compartilhados em `@cyl/contracts` (Zod). Portas em `@cyl/core`. Jogos via `packages/game-adapters/*`.
- Video: importacao manual de MP4 (sem gravacao automatica).
- IA: hibrida e opt-in. O motor local e o principal; a IA externa so via backend, com consentimento.
- Integracao Riot desativada sem Production Key + aprovacao de RSO. O modo `mock` e so para desenvolvimento e e recusado em producao.

## Regras inegociaveis

- Nunca ler memoria do jogo, contornar o Vanguard, acessar tokens/protocolos privados, usar endpoints nao autorizados da Riot ou dar assistencia tatica em tempo real.
- Nunca inventar URLs, escopos ou capacidades da Riot API. Implementar so a partir da documentacao oficial.
- Nunca embutir segredo/chave no desktop ou no web. Credenciais so no servidor; logs sem credenciais.
- Usar somente fixtures sinteticas e rotula-las (`origin: "synthetic"`); nunca apresentar dado inventado como real.
- Todo `Finding` tem evidencia rastreavel e distingue `fact` de `hypothesis`; recomendacoes apontam para Findings.
- Validar toda entrada externa (Zod). TypeScript `strict` sempre ligado.
- Pasta do VALORANT e opcional e nao substitui a API oficial. O usuario controla seus dados locais.

## Estrutura

```
apps/desktop/                 # Tauri 2 + React (src/, src-tauri/)
apps/web/                     # Next.js
services/api/                 # Fastify
packages/config/              # tsconfig base strict
packages/contracts/           # schemas Zod versionados
packages/core/                # Result, ProviderError, portas
packages/game-adapters/valorant/  # normalizador (hoje: formato sintetico)
fixtures/valorant/            # dados sinteticos
docs/{architecture,decisions,compliance,ux}/, docs/roadmap.md
```

Pacotes internos sao TypeScript-fonte (sem build). Nao criar pacote vazio: `ui`, `analytics` e `coaching` nascem com P0-05, P0-08 e o design system.

## Comandos

```bash
pnpm install
pnpm dev            # desktop Tauri (requer Rust + WebView2); VITE_CYL_DEV_SEED=1 grava fixtures sinteticas, CYL_SENSE_DATA_DIR isola o banco (so debug)
pnpm dev:web        # front-end do DESKTOP no navegador (nome mantido por compatibilidade)
pnpm dev:site       # site Next.js em :3000
pnpm dev:api        # API em :4000 (Riot desativada)
pnpm dev:demo       # API mock + site (login e partidas sinteticos)
pnpm typecheck
pnpm test
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml   # persistencia SQLite
pnpm build:web      # front-end do desktop
pnpm build:site     # site
pnpm build          # instalador desktop (Windows)
```

Node >= 22.9. Nenhuma variavel de ambiente e obrigatoria (ver `services/api/.env.example`).

## Fluxo de trabalho

- Inspecionar a pasta antes de modificar arquivos.
- Fazer apenas a tarefa do backlog pedida; nao avancar sem autorizacao.
- Ao final de cada tarefa relatar: Implementado, Arquivos, Testes, Pendencias, Proximo passo.
- Evitar releituras desnecessarias, refatoracoes fora do escopo e testes completos a cada alteracao.
- Decisoes duraveis vao para `docs/decisions/` (ADR).

## Status

Detalhes em [docs/roadmap.md](docs/roadmap.md).

- [x] P0-01 Bootstrap do desktop: verificado no Linux (typecheck, testes, build web, cargo check/clippy, binario nativo) e no Windows (`pnpm dev` abre a janela, `pnpm build` gera instalador NSIS); ver docs/architecture/p0-01-aceite.md
- [x] v0.2 Fundacao Web/Desktop/API (ver docs/architecture/v0.2-estado-e-migracao.md)
- [x] P0-02 Contratos e dominio: contratos 1.1.0, adaptador sintetico com testes negativos e desktop consumindo os pacotes; ver docs/architecture/p0-02-aceite.md e ADR 0003
- [x] P0-03 SQLite: banco em `%LOCALAPPDATA%\gg.cyl.sense\data`, schema v1, migracoes versionadas, partidas idempotentes, videos e marcacoes; ver docs/architecture/p0-03-aceite.md, local-persistence.md e ADR 0004
- [x] P0-04 Importacao: dialogo nativo aberto pelo Rust, formatos `cyl-synthetic-valorant` v1 e `cyl-local-bundle` v1, lote atomico, historico e detalhe; ver docs/architecture/p0-04-aceite.md, match-import.md e ADR 0005
- [ ] P0-05 Analytics Engine
- [ ] P0-06 Dashboard
- [ ] P0-07 Video manual
- [ ] P0-08 Coaching local
- [ ] P0-09 Qualidade e build (inclui ESLint/Prettier e CI)
- Bloqueado: login Riot real e partidas reais (Production Key + RSO)
