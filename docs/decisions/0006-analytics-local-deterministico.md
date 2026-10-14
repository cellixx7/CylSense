# ADR 0006 - Analytics local, deterministico, sob demanda e so com fatos

- Status: aceita
- Data: 2026-10-14
- Contexto: P0-05 (Analytics Engine)

## Contexto

O desktop precisa de metricas e padroes sobre as partidas locais, offline. Os dados tem lacunas declaradas (headshot, dano, lados, placar opcionais; eventos com cobertura parcial por padrao). O contrato `Finding.hypothesis` exige `confidence` numerica, e o produto proibe apresentar numero inventado como medida real.

## Decisao

1. O motor e o pacote `@cyl/analytics`, TypeScript puro, sem dependencia de Tauri/SQLite/Next/Fastify e sem dependencia de runtime nova.
2. Resultados sao **calculados sob demanda** e nao sao persistidos (sem tabelas novas). Cache, se necessario, sera chaveado por `engineVersion` + partida + `updatedAt`.
3. **Deterministico**: sem relogio nem aleatoriedade; ordem cronologica com desempate por id.
4. Metrica sem dado vira `unavailable` com motivo. Analises que dependem de todos os eventos exigem `eventCoverage = complete`.
5. Agregacoes de sessao sao ponderadas (soma/soma), nunca media de razoes.
6. O motor emite **somente `Finding` do tipo `fact`**. Interpretacoes saem como "hipoteses a verificar", sem confianca numerica, ate existir um criterio de confianca justificavel (P0-08 ou posterior).
7. A sessao recebe um `playerRef` por partida; nao ha identidade do usuario entre partidas ate o vinculo de contas.

## Consequencias

- Contratos continuam 1.1.0; nada muda no Rust nem no schema SQLite.
- O Coach (P0-08) recebe `toCoachInput` e nao recalcula estatisticas.
- Mudanca de formula/limiar exige incrementar `ANALYTICS_ENGINE_VERSION` e o `ruleVersion` do detector.
- Sessoes acima de 500 partidas precisam de paginacao pelo chamador.
