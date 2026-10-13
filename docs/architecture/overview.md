# Arquitetura v0.1 - CYL Sense Desktop

## Principio

Monolito modular, local-first. Cada responsabilidade vive em um modulo isolado, sem infraestrutura distribuida.

```
CYL Sense Desktop (Tauri 2)
 └─ Application / Use Cases
     ├─ Data Import        (adaptador VALORANT -> dominio canonico)
     ├─ Analytics Engine   (metricas deterministicas, padroes)
     ├─ Video Review       (MP4 manual, marcacoes, offset)
     └─ Coaching Engine    (regras locais; AIProvider inativo)
 └─ Persistencia: SQLite local
 └─ AI Gateway (futuro, opt-in, isolado)
```

## Camadas e escopo

| Camada | Tecnologia | Escopo |
|---|---|---|
| Desktop | Tauri 2 + React + TypeScript | P0 |
| UI | Tailwind CSS + shadcn/ui | P0 |
| Nativo | Rust / comandos Tauri | P0 |
| Persistencia | SQLite local + migracoes | P0-03 |
| Contratos | TypeScript + Zod | P0-02 |
| Testes | Vitest (Playwright quando necessario) | P0 |
| IA externa | Gateway seguro, sem segredo no bundle | Futuro |

## Motor inteligente em tres etapas

1. **Deterministico**: metricas reproduziveis com limites amostrais.
2. **Visual**: partidas associadas a videos do usuario, marcacao manual no MVP.
3. **Interpretacao**: IA opcional recebe apenas evidencias selecionadas e declara limitacoes.

## Principio epistemologico

Separar **evidencia observada**, **hipotese** e **recomendacao**. Estatistica sozinha raramente prova a causa de uma morte.

## Modulos previstos (a partir do P0-02)

`packages/core`, `packages/game-adapters/valorant`, `packages/analytics`, `packages/coaching`, `packages/ui`.

No P0-01 existe apenas `apps/desktop`; os pacotes sao criados quando cada tarefa os exigir.
