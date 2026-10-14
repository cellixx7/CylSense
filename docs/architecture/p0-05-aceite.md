# P0-05 - Analytics Engine

**Prioridade**: Critica | **Esforco**: M

## Escopo

Primeiro motor estatistico: metricas por jogador e partida, analise por rodada e lado, sessoes (agregacao e comparacao), padroes com amostra minima, evidencias rastreaveis e entrada estruturada para o futuro CYL Coach. Offline, deterministico, TypeScript puro. Fora do escopo: dashboard (P0-06), video (P0-07), Coach/recomendacoes (P0-08), IA generativa, Riot, persistencia de resultados, redesign.

Decisao: [ADR 0006](../decisions/0006-analytics-local-deterministico.md). Arquitetura: [analytics-engine.md](analytics-engine.md). Formulas: [catalogo de metricas](../analytics/metrics-catalog.md). Padroes: [regras de padroes](../analytics/pattern-rules.md).

## Inspecao inicial

- Branch `claude/vibrant-gauss-5lxtsf` limpa e alinhada com `origin` (0/0) em `2f82e27` (P0-04 sincronizado).
- Contratos 1.1.0: contadores sempre presentes; `headshotKills`/`damageDealt` em todos ou em nenhum; lado, condicao de vitoria e placar opcionais; eventos com `timeMs` obrigatorio e cobertura `partial` por padrao (as duas fixtures sao parciais).
- Lacunas que orientaram o desenho: nao ha identidade do usuario entre partidas (`playerRef` so vale na partida; nomes das fixtures diferem); `Evidence` nao tem tipo "agregacao de sessao"; `Finding.hypothesis` exige confianca numerica; nao ha impactos de disparo (HS% tradicional) nem dados para ACS.
- Resultado: nenhuma mudanca de contrato. Padroes de sessao citam a metrica de cada partida; hipoteses saem como "a verificar", sem `Finding` com confianca inventada.

## Implementado

| Area | Arquivos |
|---|---|
| Metricas por partida (24 chaves, disponibilidade explicita) e `toMatchMetrics` | `packages/analytics/src/metrics/` |
| Analise por rodada (lado, vencidas x perdidas, abertura, spike, distribuicao) | `packages/analytics/src/rounds/round-analysis.ts` |
| Sessao (ordem deterministica, soma/soma, alertas, limite 500) e `compareGroups` | `packages/analytics/src/sessions/` |
| Detectores `side_round_win_gap`, `first_death_frequency`, `session_trend` | `packages/analytics/src/patterns/detectors.ts` |
| Evidencias: construcao e validacao (metrica com valor igual ao calculado, evento, rodada; video recusado) | `packages/analytics/src/evidence/evidence.ts` |
| Entrada do Coach (`toCoachInput`, versao 1) | `packages/analytics/src/coach/coach-input.ts` |
| Servico de aplicacao do desktop | `apps/desktop/src/analytics/analytics-service.ts` |
| Secao "Metricas calculadas" no detalhe (previa tecnica) | `apps/desktop/src/pages/matches/MatchAnalytics.tsx`, `MatchDetail.tsx` |

Pacote novo `@cyl/analytics` (depende so de `@cyl/contracts` e `@cyl/core`). Nenhuma dependencia de runtime nova, nenhuma mudanca no Rust, no schema SQLite (v1) ou nos contratos (1.1.0).

## Confiabilidade

- **Formulas** documentadas no catalogo; K/D, KDA = (K + A) / D, abates com headshot / abates (nao e HS% por disparo), dano por rodada (nao e ACS; ACS nao calculado).
- **Dados insuficientes**: `missing_data`, `zero_denominator`, `partial_event_coverage`, `no_rounds`; nunca zero presumido, nunca `Infinity`/`NaN`.
- **Cobertura parcial**: contadores continuam validos; abertura, spike e detalhe por rodada ficam indisponiveis.
- **Amostras minimas**: 12 rodadas por lado; 2 partidas e 20 rodadas determinaveis; 3 partidas e 36 rodadas por metade. Justificativas em pattern-rules.md. Regras descritivas, sem significancia nem confianca numerica.
- **Limitacoes** acompanham cada partida, padrao e sessao (sintetico, modos misturados, metrica disponivel so em parte das partidas, amostra pequena).

## Resultado da verificacao (2026-10-14, Windows 10 Pro 19045)

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | OK nos 7 workspaces |
| `pnpm test` | OK: **238 testes** (contracts 27, core 6, valorant 11, api 16, web 6, analytics **106**, desktop **66**; eram 125) |
| `pnpm build:web` | OK (aviso do Rollup sobre anotacao no Zod ja existia) |
| `pnpm build:site` | nao executado: o site nao depende do pacote novo nem foi alterado |
| `cargo test` / `cargo clippy` | nao executados: Rust nao foi alterado (`git diff 2f82e27 -- apps/desktop/src-tauri` vazio) |
| Busca de segredos no diff | nada encontrado |

### Cobertura dos testes

- Metricas: fixtures `syn-0001`/`syn-0002` com valores esperados; K/D e KDA sem mortes; KDA com assistencias; headshot sem abates; campos opcionais ausentes; partida sem rodadas e sem placar; lados ausentes; jogador inexistente; partida fora do contrato; determinismo sem mutar a entrada; `MatchMetrics` valido.
- Rodadas: lado e resultado; vencidas x perdidas; abates simultaneos (ambigua); primeiro abate sem autor; rodada sem abates; spike (plant do time, defuse, plant nao atribuivel); todas as rodadas ambiguas; cobertura parcial.
- Evidencias: validas (metrica, evento, rodada) e recusadas (partida fora, evento/rodada inexistente, evento de outra partida, metrica desconhecida/indisponivel/valor divergente, video, malformada); `checkFinding`; findings gerados passam tambem em `checkFindingInContext` dos contratos.
- Sessoes: vazia; fixtures (totais, ponderacao, alertas, periodo); denominadores diferentes (4/11, nao 65%); K/D agregado com partida sem mortes; independencia de ordem e desempate por id; repetida, jogador inexistente, excesso; `compareGroups`.
- Padroes: cada detector com amostra suficiente (detectado, evidencias rastreaveis), abaixo do limiar e insuficiente; cobertura parcial nunca gera abertura; regras gerais (so `fact`, sem `confidence`).
- Propriedades (25 seeds reproduziveis): valores finitos e razoes em [0,1]; lados somam as rodadas; exatamente uma primeira morte por rodada determinavel entre os 10 jogadores; abates do time = mortes do adversario; totais da sessao = soma das partidas; entrada do Coach serializavel e sem NaN.
- Desempenho: 500 partidas x 24 rodadas em ~95 ms.
- Desktop: servico (partida do banco, sessao cronologica, nao encontrada, jogador inexistente, falha do banco, limite sem ler o banco, excecao do motor contida); UI do detalhe (valores formatados, base, indisponiveis explicados, troca de jogador, fixture sem headshot/dano).

### Nao verificado

- A janela Tauri (`pnpm dev`) nao foi aberta neste passo: a secao nova e coberta pelos testes de componente com o `LocalStore` em memoria e pelo `build:web`; o caminho nativo (Rust/SQLite) nao mudou desde o P0-04.
- Instalador NSIS (pendencia herdada do P0-04, P0-09).

## Pendencias

- Painel/relatorios com as metricas de sessao e padroes (P0-06), incluindo escolha do jogador por partida (ou vinculo de conta) para montar sessoes na UI.
- Hipoteses com confianca exigem um criterio justificavel; ate la, so "hipoteses a verificar".
- `Evidence` sem tipo de agregacao de sessao: se o Coach precisar citar o agregado diretamente, avaliar contrato 1.2.0 (aditivo).
- Fixture sintetica com cobertura completa para demonstrar abertura e spike na UI (hoje so nos testes, via construtor).
- Cache de resultados so se uma medicao mostrar necessidade.

## Proximo passo

P0-06 - Dashboard e relatorios, consumindo `analyzeSession`/`toCoachInput` sem recalcular estatisticas na UI.
