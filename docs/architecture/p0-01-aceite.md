# P0-01 - Bootstrap do desktop

**Prioridade**: Critica | **Esforco**: M

## Escopo

Tauri 2, React/TypeScript, Tailwind/shadcn, scripts, shell e navegacao.

## Criterio de aceite (do backlog)

O app inicia no Windows e pode ser compilado.

## Checklist

| Item | Verificavel em Linux/CI | Verificavel so no Windows |
|---|---|---|
| `pnpm typecheck` sem erros | sim | |
| `pnpm test` passa | sim | |
| `pnpm build:web` gera `dist/` | sim | |
| `cargo check` do `src-tauri` | sim (com libs GTK/WebKit) | |
| `pnpm dev` abre a janela | | sim |
| `pnpm build` gera instalador | | sim |

## Resultado da verificacao (2026-10-13, ambiente Linux)

- `pnpm typecheck`: OK
- `pnpm test`: OK (3 testes)
- `pnpm build:web`: OK
- `cargo check`: **nao executado com sucesso** - faltam bibliotecas de sistema (gdk-3.0/GTK/WebKit) no ambiente Linux. Nao indica erro no codigo; precisa ser validado no Windows.
- `pnpm dev` e `pnpm build` (instalador NSIS): **pendentes no Windows**.
- Icones em `src-tauri/icons/` sao provisorios (gerados de uma imagem simples); substituir pela identidade visual real com `pnpm --filter @cyl/desktop tauri icon <imagem.png>`.

## Fora de escopo

Contratos, SQLite, importacao, analytics, video, coaching (P0-02 em diante).
