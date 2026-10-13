# Fixtures VALORANT (sinteticas)

Arquivos no formato `cyl-synthetic-valorant`, definido em
`packages/game-adapters/valorant/src/synthetic-format.ts`.

- Todos os dados sao **inventados** para testes e demonstracao. Os nomes de jogadores usam o prefixo `Synth`.
- O formato **nao** e o payload da Riot API. Nao use estes arquivos para inferir campos ou endpoints oficiais.
- Partidas normalizadas a partir destes arquivos recebem `origin: "synthetic"`, e a UI deve indicar isso.
- As partidas sao parciais (poucos rounds) e nao representam uma partida competitiva completa.
