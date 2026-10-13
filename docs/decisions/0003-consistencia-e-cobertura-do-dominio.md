# ADR 0003 - Consistencia e cobertura de dados no modelo de dominio

- Status: aceita
- Data: 2026-10-13
- Relacionada: [ADR 0002](0002-separacao-web-desktop-api.md)

## Contexto

O P0-02 completou o contrato `Match` (lados, condicao de vitoria, placar, headshots, dano, assistencias) para alimentar o Analytics Engine (P0-05) e o CYL Coach (P0-08). Fontes diferentes entregam niveis diferentes de detalhe: as fixtures sinteticas sao parciais, e o payload oficial da Riot ainda e desconhecido. Sem uma regra explicita, o motor poderia tratar campo ausente como zero e produzir diagnosticos falsos.

## Decisao

1. **Ausente nao e zero.** Todo campo novo e opcional e o adaptador so o emite quando a origem informa. `headshotKills` e `damageDealt` valem para todos os participantes ou para nenhum. `matchDataAvailability(match)` diz ao motor o que pode ser calculado.
2. **Cobertura de eventos declarada** (`eventCoverage`): `partial` (padrao) exige contadores >= eventos; `complete` exige igualdade. Assim, partidas parciais continuam validas sem permitir contradicoes.
3. **Consistencia no contrato**, nao no consumidor: placar x rounds, rounds 1..n, condicao de vitoria x lado, plant/defuse x lado, defuse so apos plant, kill com alvo, assistencia so de companheiro do autor, eventos dentro da duracao.
4. **Hipotese nunca e comprovada**: `confidence` de `hypothesis` e estritamente menor que 1 e `limitations` continua obrigatoria. Validacoes que dependem de outros dados (evidencia aponta para partida/evento/round/video existentes, recomendacao aponta para Finding da mesma sessao, marcacao dentro do video) ficam em funcoes `check*` puras, porque um schema isolado nao enxerga a sessao.
5. **Versionamento**: so mudancas aditivas => `CONTRACTS_VERSION` 1.0.0 -> **1.1.0** e `SCHEMA_VERSION` permanece 1. As novas regras de consistencia apertam a validacao, mas todos os dados existentes (fixtures, API mock) continuam validos; por isso nao e MAJOR. O formato sintetico permanece `formatVersion: 1` (campos novos opcionais).

## Consequencias

- O P0-05 consulta `matchDataAvailability` e nao calcula HS%/dano/lado quando o dado falta.
- O P0-03 pode gravar `Match` como esta; `LocalImportEnvelope` (`schemaVersion`) e o ponto de entrada das migracoes.
- Um adaptador do payload oficial da Riot tera de mapear para estes campos somente o que a documentacao oficial garantir; o resto fica ausente.
