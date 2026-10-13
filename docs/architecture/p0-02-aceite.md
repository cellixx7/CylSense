# P0-02 - Contratos, dominio e ambiente local

**Prioridade**: Critica | **Esforco**: M

## Escopo

Completar o modelo de dominio em `@cyl/contracts`, evoluir o adaptador sintetico VALORANT e ligar o desktop aos pacotes compartilhados. Fora do escopo: SQLite (P0-03), importacao de arquivos do usuario (P0-04), calculo de metricas (P0-05), telas novas (P0-06), video real (P0-07), Riot real.

## Criterio de aceite

Contratos consistentes e versionados, adaptador sintetico testado (positivo e negativo), desktop consumindo os pacotes pelo workspace com validacao Zod, sem regressao em web, API e desktop.

## Modelo de dominio (contratos 1.1.0, `schemaVersion` 1)

| Area | Contrato | Novo no P0-02 |
|---|---|---|
| Partida | `Match` | `eventCoverage` (`complete`/`partial`), `result` (placar + vencedor/empate) |
| Participante | `MatchParticipant` | `headshotKills` (abates por headshot), `damageDealt` (pontos de vida) - opcionais, todos ou nenhum |
| Round | `Round` | `attackingTeam` (lado; `sideOf`), `winCondition` (`elimination`, `spike_detonated`, `spike_defused`, `time_expired`) |
| Evento | `MatchEvent` | `headshot` e `assistRefs` (somente em `kill`) |
| Disponibilidade | `matchDataAvailability(match)` | diz ao P0-05 o que pode ser calculado |
| Evidencia | `Evidence` | tipo `round`; trecho de video exige `endMs >= startMs` |
| Diagnostico | `Finding` | `sampleSize` (`count` > 0, `matches`/`rounds`/`events`); `limitations` opcional em `fact`; `confidence` < 1 em `hypothesis` |
| Contexto | `checkFindingInContext`, `checkRecommendationLinks` | evidencia aponta para partida/evento/round/video da sessao; recomendacao aponta para Finding da mesma sessao |
| Video | `VideoReference` (movido para `video.ts`, mesmo nome), `VideoMarker` | marcacao manual (`source: "manual"`, timestamp, rotulo, descricao, round); `videoToMatchTimeMs`/`matchToVideoTimeMs`; `checkVideoMarker` |
| Envelope local | `LocalImportEnvelope` (`cyl-local-bundle`, `schemaVersion`) | prepara migracoes do P0-03/P0-04; nao e importador |
| Parse | `parseWith`/`describeIssues` em `@cyl/core` | `Result` + mensagem legivel (caminho + motivo, sem ecoar valores) |

Nomes publicados preservados: `origin`, `CoachingRecommendation`, `VideoReference`, `Finding` (`fact`/`hypothesis`), `Evidence`.

## Regras de validacao

Ver [ADR 0003](../decisions/0003-consistencia-e-cobertura-do-dominio.md). Resumo: placar = rounds vencidos e vencedor coerente; rounds 1..n; time vencedor com participantes; condicao de vitoria coerente com o lado (e exige lado, exceto `elimination`); plant pelo ataque, defuse pela defesa e so apos plant; kill exige alvo; assistencia so de companheiro do autor, sem duplicata, nunca autor/alvo; eventos dentro da duracao; contadores >= eventos (`partial`) ou = eventos (`complete`); `headshotKills` <= `kills`. Dado ausente continua ausente.

## Compatibilidade

Mudancas aditivas: `CONTRACTS_VERSION` 1.0.0 -> 1.1.0 (MINOR). As regras novas apertam a validacao, mas todos os dados existentes continuam validos (testes de API e web inalterados e passando). Formato sintetico segue `formatVersion: 1`.

## Adaptador VALORANT (`@cyl/game-adapter-valorant`)

Valida o formato `cyl-synthetic-valorant` (`parseWith`), normaliza de forma deterministica (ids de evento derivados do `matchId`; so o `id` da partida vem de `ctx.newId`), sempre com `origin: "synthetic"`, e valida o resultado contra `Match`. Nao faz nenhuma chamada de rede nem conhece a Riot API. Fixtures: `syn-0001` (com headshots, dano e assistencias), `syn-0002` (sem esses campos, para exercitar dado ausente) e `fixtures/valorant/invalid/` (5 casos negativos).

## Integracao com o desktop

`apps/desktop` depende de `@cyl/contracts`, `@cyl/core` e `@cyl/game-adapter-valorant` (`workspace:*`). `src/domain/synthetic.ts` expoe `normalizeSyntheticMatch`; o teste normaliza as fixtures e valida com Zod. O rodape mostra a versao dos contratos (`contratos 1.1.0`), o que obriga o `vite build` a empacotar o pacote. Nenhum dado de partida aparece na UI (teste do App mantido).

## Limitacoes da Riot API

Nada foi inferido da Riot API. Login Riot real e partidas reais seguem bloqueados ate a Production Key e a aprovacao do RSO ([compliance](../compliance/riot.md)).

## Resultado da verificacao (2026-10-13, Windows 10 Pro 19045, Node 24.20, pnpm 10.28, Rust 1.99)

### Etapa A - ambiente antes das mudancas

| Item | Resultado observado |
|---|---|
| Git | branch `claude/vibrant-gauss-5lxtsf`, working tree limpo, alinhado com `origin` |
| Portas 3000/4000/1420 | livres antes de iniciar |
| `pnpm install --frozen-lockfile` | OK |
| `pnpm dev:demo` | web Next 16.4 em `http://localhost:3000`; API em `http://127.0.0.1:4000`, `authMode: mock` com aviso de modo mock no log |
| HTTP via `/api` (proxy do web) | `/`, `/partidas`, `/entrar`, `/download` 200; `health` OK; `/me` sem sessao 401; login mock redireciona para `/partidas`; sync sem `x-cyl-request` 403; sync com cabecalho `imported: 2`; listagem com `origin: synthetic` e `containsSyntheticData: true` |
| Logs | sem tokens, `code` ou `state` (busca por `accessToken`, `mock-token`, `code=`) |
| `pnpm dev` | Vite em `localhost:1420` + `cyl-sense.exe`; janela capturada: Visao geral, menu com as 5 areas, rodape `v0.1.0 · offline`, sem tela branca |
| Visual web | capturas do Edge headless: home, `/partidas` sem sessao (convite para conectar) e com sessao mock (aviso "Dados sinteticos de demonstracao", coluna Origem = sintetica) |
| Testes de linha de base | 44 passando |

### Etapa C - depois das mudancas

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | OK nos 6 workspaces |
| `pnpm test` | OK: **73 testes** (contracts 27, core 6, valorant 11, api 16, web 6, desktop 7) |
| `pnpm build:web` | OK (aviso do Rollup sobre comentario interno do Zod, sem efeito) |
| `pnpm build:site` | OK; `/`, `/download`, `/partidas` estaticas, `/entrar` dinamica |
| API recarregada (`tsx watch`) | `health` -> `contractsVersion: "1.1.0"`; login + sync `imported: 2, rejected: 0` com o adaptador novo (a pasta `invalid/` e ignorada pelo provedor mock) |
| `pnpm dev` reiniciado | janela nativa abre com o rodape `v0.1.0 · contratos 1.1.0 · offline` |
| `pnpm build` (instalador) | nao repetido: nenhuma mudanca em `src-tauri`, dependencias Rust ou configuracao de empacotamento; o frontend passa por `build:web` |

### Nao verificado

- Clique nos itens do menu na janela nativa (navegacao coberta pelo teste do App; a captura foi feita sem controlar mouse/teclado do usuario).
- Largura de 390 px real: o Edge headless no Windows fixa o viewport minimo em 492 px; nessa largura o layout quebra linha corretamente.
- Console do WebView2 (sem DevTools automatizado nesta sessao); o log do Vite/Tauri nao mostrou erros.

## Pendencias

- Economia por round (opcional no prompt do P0-02): adiada ate haver fonte que a forneca de forma coerente.
- Persistencia de `Match`/`VideoMarker` e migracoes: P0-03.
