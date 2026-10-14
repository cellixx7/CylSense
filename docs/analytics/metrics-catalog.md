# Catalogo de metricas (Analytics Engine)

Fonte de verdade no codigo: `packages/analytics/src/metrics/catalog.ts` (`METRIC_CATALOG`) e `sessions/aggregate.ts`. Versao do motor: `cyl-analytics/0.1.0`.

## Convencoes

- Toda metrica e calculada **para um jogador (`playerRef`) em uma partida**. `playerRef` so vale dentro da partida; numa sessao, o chamador informa o jogador de cada partida.
- Resultado: `available` (valor, unidade, `sampleSize` e, em razoes, `numerator`/`denominator`) ou `unavailable` com motivo. **Ausente nunca vira zero.**
- Motivos de indisponibilidade:

| Motivo | Quando |
|---|---|
| `missing_data` | A origem nao informa o campo (headshot, dano, lado) ou nenhuma rodada tem ordem de abates determinavel |
| `zero_denominator` | Denominador zero (ex.: K/D sem mortes). Nunca `Infinity`/`NaN` |
| `partial_event_coverage` | Depende de todos os eventos e `eventCoverage` e `partial` (ou ausente) |
| `no_rounds` | Partida sem rodadas registradas |

- Unidades: `count`, `ratio` (fracao; a UI formata como % quando faz sentido), `per_round`. `MatchMetrics` (contrato) recebe so as disponiveis (`toMatchMetrics`).
- Disponibilidade dos dados vem de `matchDataAvailability` (contratos): headshot e dano estao em todos os participantes ou em nenhum; lado conta como disponivel so se todas as rodadas o informam.

## Metricas por partida

| Chave | Formula | Exige | Observacoes |
|---|---|---|---|
| `rounds_played` | `rounds.length` | rodadas | Assume que o jogador participou de todas as rodadas registradas |
| `kills`, `deaths`, `assists` | contadores do participante | — | Vem dos contadores, nao dos eventos (validos mesmo com cobertura parcial). `sampleSize` = rodadas |
| `kd_ratio` | `kills / deaths` | `deaths > 0` | Sem mortes: `zero_denominator` (nao se inventa "K/D = abates") |
| `kda_ratio` | `(kills + assists) / deaths` | `deaths > 0` | Formula explicita; ha variantes no mercado (ex.: com peso para assistencias), esta e a usada aqui |
| `kills_per_round`, `deaths_per_round` | contador / `rounds_played` | rodadas > 0 | |
| `headshot_kills` | `headshotKills` | campo informado | Abates com headshot, nao acertos |
| `headshot_kill_ratio` | `headshotKills / kills` | campo informado e `kills > 0` | **Nao e o HS% tradicional** (headshots / impactos de disparo): o contrato nao tem impactos |
| `damage_dealt` | `damageDealt` | campo informado | Dano total causado |
| `damage_per_round` | `damageDealt / rounds_played` | campo informado e rodadas > 0 | Nao e ACS. **ACS nao e calculado**: exige dados e formula oficial que o contrato nao tem |
| `rounds_won` | rodadas com `winningTeam` = time do jogador | rodadas | Resultado do time |
| `round_win_ratio` | `rounds_won / rounds_played` | rodadas > 0 | |
| `attack_rounds_played`, `attack_rounds_won`, `attack_round_win_ratio` | rodadas com `attackingTeam` = time | lado em todas as rodadas | Lado sem rodadas: razao `zero_denominator` |
| `defense_rounds_played`, `defense_rounds_won`, `defense_round_win_ratio` | idem, com o time defendendo | lado em todas as rodadas | |
| `first_kills` | rodadas em que o jogador fez o abate de menor `timeMs` | cobertura completa | `sampleSize` = rodadas determinaveis (ver abaixo) |
| `first_deaths` | rodadas em que o jogador foi o alvo do abate de menor `timeMs` | cobertura completa | idem |
| `spike_plants`, `spike_defuses` | eventos do jogador | cobertura completa | Com cobertura parcial, evento ausente nao prova que nao aconteceu |

### Rodadas determinaveis (abertura)

- Rodada sem abates: determinavel (ninguem abriu nem morreu primeiro).
- Dois ou mais abates no menor `timeMs` da rodada: **ambigua**, excluida das duas amostras.
- Primeiro abate sem autor (`actorRef` ausente): entra na amostra de primeiras mortes (o alvo sempre existe), mas nao na de primeiros abates.
- A ordem usa so `timeMs`; a posicao no array de eventos nao e considerada ordem.

### Exemplo (fixture sintetica `syn-0001`, Synth Alpha / `p1`)

3 abates, 1 morte, 0 assistencias, 2 abates com headshot, 620 de dano, 3 rodadas (2 vencidas, todas no ataque):
K/D = 3,00; KDA = 3,00; abates com headshot/abates = 2/3 = 66,7%; dano por rodada = 206,7; aproveitamento = 66,7%; ataque 2/3; defesa: `zero_denominator`; primeiros abates/mortes e spike: `partial_event_coverage`.

## Analise por rodada (`analyzeRounds`)

Sempre: resultado (`won`/`lost`) e, se informados, lado e condicao de vitoria; `bySide` (jogadas/vencidas por lado) quando todas as rodadas tem lado.

So com cobertura completa: abates/mortes/assistencias do jogador por rodada, abates e mortes do time (pelo time do alvo), abertura, spike (rodadas com plant do time e quantas foram vencidas; plants e defuses do jogador), rodadas vencidas x perdidas e distribuicao de abates por rodada (0..4, 5+). Com cobertura parcial esses campos sao `null` e a limitacao e declarada.

Nao infere: erro de posicionamento, comunicacao, mira, decisao tatica, falta de cobertura. Isso exige evidencia adicional (normalmente video).

## Metricas de sessao (`aggregate`)

Agregacao **ponderada**: soma dos numeradores / soma dos denominadores, nunca a media das razoes por partida. Cada metrica traz `matchesUsed` (partidas que tinham o dado).

| Chave | Formula |
|---|---|
| `rounds_played`, `kills`, `deaths`, `assists` | soma |
| `kd_ratio` | `Σkills / Σdeaths` (inclui partidas em que o K/D da partida era indefinido) |
| `kda_ratio` | `(Σkills + Σassists) / Σdeaths` |
| `kills_per_round`, `deaths_per_round` | `Σcontador / Σrodadas` (partidas com rodadas) |
| `headshot_kill_ratio` | `ΣheadshotKills / Σkills`, so partidas com headshot |
| `damage_per_round` | `Σdano / Σrodadas`, so partidas com dano |
| `round_win_ratio` | `Σvencidas / Σjogadas` |
| `attack_round_win_ratio`, `defense_round_win_ratio` | idem por lado, so partidas com lado |
| `first_kill_ratio`, `first_death_ratio` | `Σprimeiros / Σrodadas determinaveis`, so partidas com cobertura completa |

Exemplo: partida A com 1 de 1 rodada vencida e partida B com 3 de 10 dao 4/11 = 36%, nao (100% + 30%) / 2 = 65%.

`compareGroups(a, b)` aplica a mesma agregacao a dois grupos e devolve as diferencas (`b - a`) so onde as duas razoes existem, com alerta para grupos com menos de 3 partidas ou modos diferentes. E descritivo: nao indica causa nem significancia.
