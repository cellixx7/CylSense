# Fixtures VALORANT (sinteticas)

Arquivos no formato `cyl-synthetic-valorant`, definido em
`packages/game-adapters/valorant/src/synthetic-format.ts`.

- Todos os dados sao **inventados** para testes e demonstracao. Os nomes de jogadores usam o prefixo `Synth`.
- O formato **nao** e o payload da Riot API. Nao use estes arquivos para inferir campos ou endpoints oficiais.
- Partidas normalizadas a partir destes arquivos recebem `origin: "synthetic"`, e a UI deve indicar isso.
- As partidas sao parciais (poucos rounds) e nao representam uma partida competitiva completa.
- Campos opcionais (`headshotKills`, `damage`, `attackers`, `winCondition`, `score`, `eventCoverage`, `headshot`, `assists`) so aparecem quando a fixture os define; ausente continua ausente apos a normalizacao. `syn-0001` tem todos; `syn-0002` nao tem headshots, dano nem assistencias.
- `invalid/` guarda casos **sinteticos e invalidos de proposito** para testes negativos. O provedor mock da API le so os `.json` da raiz, entao eles nunca chegam a demonstracao.
