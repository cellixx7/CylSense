# Regras de padroes (Analytics Engine)

Codigo: `packages/analytics/src/patterns/detectors.ts` (`PATTERN_RULES`). Os detectores rodam em `analyzeSession` sobre as partidas em ordem cronologica.

## Principios

- Poucos detectores, de alta confiabilidade, sobre dados que o contrato garante. Nenhum detector existe so porque o nome parece interessante.
- Cada resultado tem: `patternId` estavel, `ruleVersion`, descricao, regra de elegibilidade, amostra considerada, `status` (`detected` / `not_detected` / `insufficient_data`), observacao com os numeros, limitacoes e, quando detectado, um `Finding` do tipo **`fact`** com evidencias.
- **Sem confianca numerica.** O contrato `Finding.hypothesis` exige `confidence`; o motor nao tem calibracao estatistica para isso, entao nao emite hipoteses como `Finding`. Interpretacoes aparecem como `hypotheses` ("hipotese a verificar": enunciado sem causalidade, como verificar e rodadas/eventos para revisao, todos validados).
- Os limiares sao **regras descritivas**, nao testes de significancia. Rodadas de uma mesma partida nao sao independentes, o que invalidaria testes classicos simples.
- Toda evidencia emitida e validada contra os dados analisados (`checkFinding`/`checkEvidence`); evidencia invalida e tratada como bug do motor.
- Separacao: **fato observado** (`Finding` `fact`) -> **padrao estatistico** (`PatternResult`) -> **hipotese interpretativa** (`hypotheses`, a verificar) -> **recomendacao** (futuro Coach, P0-08, apontando para Findings).

## `side_round_win_gap` (v1)

- **O que mede**: fracao de rodadas vencidas pelo time do jogador no ataque x na defesa, somando as partidas.
- **Elegibilidade**: partidas com lado em todas as rodadas; **12 rodadas ou mais em cada lado**.
- **Detecta**: diferenca absoluta de **25 pontos percentuais** ou mais.
- **Justificativa**: 12 rodadas = uma metade regulamentar de uma partida competitiva; com menos, uma unica rodada move a taxa em mais de 8 pontos. 25 pontos equivalem a 3 rodadas de diferenca em 12, acima da oscilacao de uma rodada isolada.
- **Evidencias**: `attack_round_win_ratio` e `defense_round_win_ratio` de cada partida. Revisao sugerida: rodadas perdidas no lado mais fraco.
- **Limitacoes**: resultado do time, nao individual; mapas/adversarios/composicoes variam; sem significancia.

## `first_death_frequency` (v1)

- **O que mede**: fracao das rodadas determinaveis em que o jogador foi o alvo do primeiro abate.
- **Elegibilidade**: so partidas com cobertura **completa** de eventos; **2 partidas ou mais** e **20 rodadas determinaveis ou mais**.
- **Detecta**: fracao >= **2x a referencia uniforme**, ponderada pelas rodadas: `Σ(rodadas_i / participantes_i) / Σrodadas_i` (com 10 jogadores, 10%; limiar 20%).
- **Justificativa**: com cobertura parcial o primeiro abate observado pode nao ser o primeiro real, por isso so cobertura completa. Exigir 2 partidas evita chamar de "recorrente" algo de uma partida so; 20 rodadas e quase uma partida completa. O dobro da referencia uniforme separa o caso de uma oscilacao pequena sem pretender ser um teste.
- **Evidencias**: `first_deaths` de cada partida e o evento (`kind: event`) de cada primeira morte.
- **Limitacoes**: primeira morte nao indica erro (funcao de entrada, troca planejada); a referencia uniforme e uma simplificacao; rodadas ambiguas excluidas.

## `session_trend` (v1)

- **O que mede**: abates por rodada e mortes por rodada da primeira metade das partidas (cronologica) contra a segunda.
- **Elegibilidade**: partidas com rodadas; **3 partidas ou mais por metade** e **36 rodadas ou mais por metade**. Quantidade impar: a partida do meio fica fora.
- **Detecta**: variacao relativa de **20%** ou mais em alguma das duas metricas (em relacao a primeira metade; primeira metade com valor 0 nao gera variacao relativa).
- **Justificativa**: 3 partidas e 36 rodadas por metade (cerca de 3 partidas completas) reduzem o efeito de uma partida atipica; 20% e uma mudanca visivel no numero que o jogador acompanha.
- **Evidencias**: a metrica que mudou, em cada partida das duas metades.
- **Limitacoes**: ordem cronologica nao implica causa; adversarios/mapas/modos podem diferir; sem significancia.

## Dados insuficientes

`insufficient_data` sempre traz `reason` com o que faltou (ex.: "Rodadas com lado informado: 3 no ataque e 0 na defesa (minimo 12 em cada)"). Sessao vazia: todos os padroes ficam `insufficient_data`.

## Alterando regras

Mudou limiar, amostra minima ou formula: incrementar `ruleVersion` do detector e `ANALYTICS_ENGINE_VERSION`, atualizar este documento e os testes de limite (`src/tests/patterns.test.ts`).
