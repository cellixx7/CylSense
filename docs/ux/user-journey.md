# Jornada do usuario

Legenda usada em todos os documentos de UX:

- **[impl]** implementado e funcionando
- **[sim]** simulado (modo `mock`, dados sinteticos; so desenvolvimento e demonstracao)
- **[futuro]** planejado, nao implementado

## 1. Jornada Web -> Desktop

```mermaid
journey
  title Do primeiro contato a analise aprofundada
  section Web
    Conhece o CYL Sense na landing [impl]: 4: Jogador
    Conecta a conta Riot [sim / futuro RSO]: 3: Jogador
    Ve historico de partidas [sim]: 4: Jogador
    Ve indicadores e diagnosticos iniciais [futuro]: 4: Jogador
    Recebe convite contextual para o desktop [impl]: 4: Jogador
  section Desktop
    Instala e abre o app [impl shell]: 3: Jogador
    Entra na conta CYL [futuro]: 3: Jogador
    Sincroniza ou importa partidas [futuro P0-04]: 4: Jogador
    Associa videos e revisa momentos [futuro P0-07]: 5: Jogador
    Recebe recomendacoes do CYL Coach [futuro P0-08]: 5: Jogador
    Acompanha a evolucao [futuro]: 5: Jogador
```

```mermaid
flowchart TD
  L["Landing /"] --> E["/entrar"]
  L --> DL["/download"]
  E -->|status disabled| X[Explica: RSO aguardando aprovacao Riot]
  E -->|status mock| M[Login de demonstracao]
  M --> P["/partidas com aviso de dados sinteticos"]
  P --> S[Sincronizar]
  P --> C[Convite: conheca o desktop]
  C --> DL
  DL -->|futuro| I[Instalador]
  I --> D1[Primeiro acesso no desktop]
```

## Principios de experiencia

- Estatistica mostra **o que** aconteceu, o video ajuda a ver **como**, e o coaching diz **o que treinar**.
- O convite ao desktop aparece quando agrega valor (depois de ver partidas), nunca como bloqueio.
- O desktop e util sem conta e offline. A conta so habilita a sincronizacao.
- Dado sintetico e sempre rotulado. Ausencia de dado aparece como ausencia, nunca preenchida.
