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
- `cargo check`: **nao executado com sucesso** na primeira verificacao (faltavam libs GTK/WebKit).

### Reverificacao (2026-10-13, Linux com libwebkit2gtk-4.1/libgtk-3 instaladas)

- `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test` (3 testes), `pnpm build:web`: OK
- `cargo check --locked` e `cargo clippy --locked -- -D warnings`: OK, sem avisos
- `tauri build --no-bundle` (binario nativo release, frontend embutido): OK
- Binario executado sob Xvfb: janela nativa abre e exibe a navegacao lateral (Visao geral, Partidas, Video, Coaching, Configuracoes)
- Scripts: `pnpm dev` = `tauri dev` (janela nativa) e `pnpm build` = `tauri build` (instalador); `dev:web`/`build:web` sao so o Vite

### Verificacao no Windows (2026-10-13, Windows 10 Pro 19045, Node 24.20, pnpm 10.28, Rust 1.99, WebView2 155)

- `pnpm install --frozen-lockfile`: OK
- `pnpm build`: OK; gerou `src-tauri/target/release/bundle/nsis/CYL Sense_0.1.0_x64-setup.exe` (2,12 MiB)
- `pnpm dev`: OK; `target/debug/cyl-sense.exe` sobe com a janela nativa "CYL Sense"
- Criterio de aceite atendido: o app inicia no Windows e pode ser compilado.
- Icones em `src-tauri/icons/` sao provisorios (gerados de uma imagem simples); substituir pela identidade visual real com `pnpm --filter @cyl/desktop tauri icon <imagem.png>`.

## Fora de escopo

Contratos, SQLite, importacao, analytics, video, coaching (P0-02 em diante).
