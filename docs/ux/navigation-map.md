# Mapa de navegacao

Legenda: [impl] implementado, [sim] simulado, [futuro] planejado. Ver [user-journey.md](user-journey.md).

## Web (`apps/web`)

```mermaid
flowchart LR
  H["/ Inicio [impl]"] --> EN["/entrar [impl]"]
  H --> PA["/partidas [impl, dados sim]"]
  H --> DO["/download [impl, sem instalador]"]
  EN -->|callback OK| PA
  EN -->|"?erro=codigo"| EN
  PA --> DO
  H -.-> DOC["/docs e /suporte [futuro]"]
  PA -.-> PD["/partidas/:id detalhe [futuro]"]
  PA -.-> CF["/conta (vinculos, revogacao, exclusao) [futuro]"]
```

Cabecalho: Inicio, Minhas partidas, Desktop. O rodape traz o aviso de nao afiliacao a Riot.

## Desktop (`apps/desktop`)

Navegacao lateral fixa, ja implementada no P0-01 como placeholders:

```mermaid
flowchart TD
  N[Barra lateral] --> O["Visao geral [impl placeholder -> P0-06]"]
  N --> M["Partidas [impl placeholder -> P0-04/P0-06]"]
  N --> V["Video [impl placeholder -> P0-07]"]
  N --> C["Coaching [impl placeholder -> P0-08]"]
  N --> S["Configuracoes [impl placeholder -> P0-09]"]
  M -.-> MD["Detalhe da partida: rounds, eventos, metricas [futuro]"]
  MD -.-> V
  S -.-> SA["Conta CYL e sincronizacao [futuro]"]
  S -.-> SP["Pasta do VALORANT (opcional) e pasta de gravacoes [futuro]"]
  S -.-> SI["IA externa: consentimento opt-in [futuro]"]
```
