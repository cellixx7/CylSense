# CYL Sense

> Understand your game. Elevate your play.

Aplicativo desktop (Windows) que transforma estatisticas de partidas e videos importados em diagnosticos justificaveis e recomendacoes de treino. Local-first: funciona offline, sem IA paga no P0.

## Requisitos

- Node.js >= 20 e pnpm 10
- Rust (stable) para o app Tauri
- Windows: WebView2 e Visual Studio Build Tools (C++) para compilar o app nativo

## Comecando

```bash
pnpm install
pnpm dev:web   # interface no navegador (http://localhost:1420)
pnpm dev       # janela desktop Tauri
```

## Documentacao

- [CLAUDE.md](CLAUDE.md) - guia e regras do projeto
- [docs/architecture/](docs/architecture/) - arquitetura e criterios de aceite
- [docs/decisions/](docs/decisions/) - decisoes (ADRs)
- [docs/compliance/](docs/compliance/) - limites de uso de dados e Riot

## Status

P0-01 (bootstrap do desktop) em andamento. Veja o backlog em CLAUDE.md.
