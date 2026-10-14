# Roadmap

Legenda: [x] concluido, [~] parcial, [ ] pendente.

## Fundacao

- [x] P0-01 Bootstrap do desktop (Tauri 2 + React), verificado no Linux e no Windows
- [x] v0.2 Fundacao arquitetural Web/Desktop/API ([ADR 0002](decisions/0002-separacao-web-desktop-api.md), [estado e migracao](architecture/v0.2-estado-e-migracao.md))

## P0 - Desktop local-first (sem Riot, sem IA paga)

- [x] P0-02 Contratos e dominio: contratos 1.1.0 (lados, placar, headshots, dano, cobertura de eventos, marcacoes de video, envelope local), adaptador sintetico evoluido e desktop ligado aos pacotes; ver docs/architecture/p0-02-aceite.md e ADR 0003
- [x] P0-03 SQLite: rusqlite em comandos Rust tipados, schema v1, migracoes transacionais com checksum e backup, partidas idempotentes por (game, origin, externalId), referencias de video e marcacoes; ver docs/architecture/p0-03-aceite.md, [persistencia local](architecture/local-persistence.md) e [ADR 0004](decisions/0004-sqlite-local-e-postgresql-no-backend.md)
- [x] P0-04 Importacao e historico: arquivo JSON escolhido em dialogo nativo (lido no Rust, so `.json`, limite de tamanho), formatos `cyl-synthetic-valorant` v1 e `cyl-local-bundle` v1, gravacao em lote atomica e idempotente, secao Partidas com historico e detalhe; ver docs/architecture/p0-04-aceite.md e [importacao de partidas](architecture/match-import.md)
- [ ] P0-05 Analytics Engine (`MatchMetrics` deterministicas; pacote `@cyl/analytics`)
- [ ] P0-06 Dashboard
- [ ] P0-07 Video manual (UI e leitura do MP4; a persistencia de `VideoReference`, offset e marcacoes ja existe desde o P0-03)
- [ ] P0-08 Coaching local (`Finding` e `CoachingRecommendation`; pacote `@cyl/coaching`)
- [ ] P0-09 Qualidade e build (ESLint/Prettier, CI, Playwright onde fizer sentido)

## W - Web

- [x] W-00 Estrutura minima (landing, entrar, partidas demo, download)
- [ ] W-01 Design system aplicado (apos o Figma)
- [ ] W-02 Indicadores e diagnosticos iniciais (reusa `@cyl/analytics`)
- [ ] W-03 Download real do instalador e documentacao/suporte

## A - API

- [x] A-00 Estrutura minima, orquestracao OAuth (state + PKCE) e sync idempotente com mock
- [ ] A-01 PostgreSQL com migracoes, tokens cifrados
- [ ] A-02 Autenticacao do desktop na conta CYL (fluxo para app nativo)
- [ ] A-03 Rate limiting de entrada e fila de sincronizacao

## Bloqueado por terceiros

- [ ] R-01 Production API Key + RSO aprovados pela Riot. **Bloqueia** login real e partidas reais.
- [ ] R-02 Implementar `RiotAuthProvider`, `RiotMatchProvider` e o adaptador do payload oficial

## Futuro

IA externa opt-in via gateway; analise visual; outros jogos (novo `GameAdapter`); pagamentos; hospedagem.
