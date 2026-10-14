# Analytics Engine (`@cyl/analytics`)

Motor estatistico local do CYL Sense (P0-05). TypeScript puro, deterministico, sem rede, LLM, GPU ou servico pago. Decisao: [ADR 0006](../decisions/0006-analytics-local-deterministico.md). Formulas: [catalogo de metricas](../analytics/metrics-catalog.md). Padroes: [regras de padroes](../analytics/pattern-rules.md).

## Posicao na arquitetura

```
LocalStore (SQLite via Rust) --Match validado--> apps/desktop/src/analytics/analytics-service.ts
                                                        |
                                                        v
                                               @cyl/analytics (puro)
                                    metrics -> rounds -> sessions -> patterns -> evidence
                                                        |
                                                        v
                                         toCoachInput (futuro CYL Coach, P0-08)
```

- Depende so de `@cyl/contracts` (tipos e validacao do `Match`, `Finding`, `Evidence`) e `@cyl/core` (`Result`). Nao conhece Tauri, SQLite, Next.js nem Fastify; pode ser reusado no site (W-02) e na API.
- Nao duplica regras dos contratos: usa `Match` (com suas regras de consistencia), `matchDataAvailability` e `sideOf`.
- Sem dependencias novas de runtime.

## Modulos

| Modulo | Arquivo | Responsabilidade |
|---|---|---|
| Metrics Engine | `src/metrics/` | `analyzeMatch(match, playerRef)`: valida a partida, calcula o catalogo, resultado (`win/loss/draw/unknown`), eventos observados e limitacoes. `toMatchMetrics` converte para o contrato `MatchMetrics` |
| Round Analyzer | `src/rounds/` | `analyzeRounds`: resultado e lado por rodada; com cobertura completa, eventos por rodada, abertura, spike, vencidas x perdidas e distribuicao |
| Session Analyzer | `src/sessions/` | `analyzeSession(sessionId, entries)`: ordena, agrega (soma/soma), conta resultados e cobertura, alerta e roda os detectores. `compareGroups` compara dois grupos |
| Pattern Detector | `src/patterns/` | 3 detectores com amostra minima; resultado `detected`/`not_detected`/`insufficient_data` |
| Evidence Builder | `src/evidence/` | Constroi e valida evidencias (`metric`, `event`, `round`) contra os dados analisados |
| Coach input | `src/coach/` | `toCoachInput`: metricas, padroes, findings, limitacoes e contexto, versionado (`COACH_INPUT_VERSION = 1`) |

## Entradas e garantias

- Entrada: `Match` (contrato) + `playerRef`. O motor revalida a partida com o schema `Match`; partida invalida -> `invalid_match`; jogador ausente -> `player_not_found`.
- Sessao: um `playerRef` por partida (o contrato nao tem identidade do usuario entre partidas; `gameAccountId` so existira com contas vinculadas). Partida repetida (id ou `game+origin+externalId`) -> `duplicate_match`. Mais de **500** partidas -> `too_many_matches` (o chamador pagina ou reduz o periodo). Entrada vazia -> sessao vazia valida.
- **Determinismo**: nao le relogio nem aleatoriedade; `computedAt` vem do chamador. Ordem cronologica por `Date.parse(startedAt)` e, em empate, por `id`. A ordem de entrada nao altera o resultado (testado).
- **Dados incompletos**: ausente -> `unavailable` com motivo; cobertura parcial nunca e tratada como "nao aconteceu".
- **Evidencias**: toda evidencia emitida e validada antes de sair (`checkFinding`); falha = excecao (bug do motor), convertida em erro tipado pela camada do desktop.

## Integracao com o desktop

`apps/desktop/src/analytics/analytics-service.ts`:

- `createAnalyticsService(store)`: `analyzeMatch(matchId, playerRef)` e `analyzeSession(sessionId, selections)`. Le pelo `LocalStore` (que ja valida o `Match` lido), verifica o limite **antes** de ler o banco, devolve `Result` com erros `storage`/`not_found`/codigos do motor/`engine_failure`.
- `analyzeLoadedMatch(match, playerRef)`: versao sincrona para telas que ja tem a partida; captura excecoes.
- UI minima: secao "Metricas calculadas" no detalhe da partida (`pages/matches/MatchAnalytics.tsx`) com escolha do jogador, valor, base (numerador/denominador) e motivo quando indisponivel. E uma previa tecnica; o dashboard e o P0-06.
- Calculo sob demanda; **nenhuma tabela nova** e nenhum comando Rust novo. Cache futuro pode usar `engineVersion` + `matchId` + `updatedAt` como chave.

## Desempenho

Medido no teste `properties.test.ts` (Windows 10, Node 22): sessao com 500 partidas sinteticas de 24 rodadas (validacao Zod incluida) em cerca de **95 ms**. Uma partida no detalhe: abaixo de 1 ms. Por isso nao ha Web Worker: so faz sentido se uma medicao futura mostrar travamento.

## Fora do escopo do P0-05

Dashboard (P0-06), video (P0-07), recomendacoes e Coach (P0-08), IA generativa, Riot, persistencia de resultados, ACS e qualquer inferencia sobre mira, posicionamento, comunicacao ou decisao tatica.
