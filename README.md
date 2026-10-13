# CYL Sense

> Understand your game. Elevate your play.

Aplicativo desktop (Windows) que transforma estatisticas de partidas e videos importados em diagnosticos justificaveis e recomendacoes de treino. Local-first: funciona offline, sem IA paga no P0.

## Requisitos

| Ferramenta | Versao | Para que serve |
|---|---|---|
| Node.js | >= 20 (LTS) | front-end e scripts |
| pnpm | 10.28.0 (fixado em `package.json`) | gerenciador de pacotes do monorepo |
| Rust (toolchain MSVC) | stable, >= 1.77 | backend nativo do Tauri |
| Visual Studio Build Tools | 2022, carga "Desktop development with C++" | linker/compilador C++ exigido pelo Rust no Windows |
| WebView2 Runtime | atual | motor de renderizacao da janela (ja vem no Windows 10/11 atualizado) |

A CLI do Tauri (`@tauri-apps/cli`) **ja e dependencia do projeto** e e instalada pelo `pnpm install`; nao precisa instalar globalmente nem via `cargo install`. O NSIS (gerador do instalador) e baixado automaticamente pelo Tauri no primeiro `pnpm build`.

## Instalacao no Windows (primeira vez)

Abra o **PowerShell** e rode:

```powershell
# 1. Node.js LTS
winget install -e --id OpenJS.NodeJS.LTS

# 2. Visual Studio Build Tools com a carga de C++ (demora alguns minutos)
winget install -e --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

# 3. Rust (rustup) e toolchain MSVC
winget install -e --id Rustlang.Rustup
rustup default stable-msvc

# 4. WebView2 (pule se ja estiver instalado)
winget install -e --id Microsoft.EdgeWebView2Runtime
```

**Feche e reabra o terminal** para carregar o novo `PATH`, depois habilite o pnpm na versao fixada pelo projeto:

```powershell
corepack enable          # se der erro de permissao, rode o PowerShell como administrador
corepack prepare pnpm@10.28.0 --activate
```

> Alternativa sem corepack: `npm install -g pnpm@10.28.0`.

Confira se tudo esta disponivel:

```powershell
node -v; pnpm -v; rustc -V; cargo -V
```

## Comecando

```powershell
git clone https://github.com/cellixx7/CylSense.git
cd CylSense
pnpm install
pnpm dev        # abre a janela desktop Tauri (a 1a compilacao do Rust leva alguns minutos)
```

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` | app desktop Tauri em modo desenvolvimento (Vite + janela nativa, com hot reload) |
| `pnpm dev:web` | so o front-end no navegador, em http://localhost:1420 (nao precisa de Rust) |
| `pnpm build` | gera o instalador Windows (NSIS) em `apps/desktop/src-tauri/target/release/bundle/nsis/` |
| `pnpm build:web` | build so do front-end em `apps/desktop/dist/` |
| `pnpm typecheck` | checagem TypeScript (strict) |
| `pnpm test` | testes (Vitest) |

Para rodar outros comandos da CLI do Tauri: `pnpm --filter @cyl/desktop tauri <comando>` (ex.: `tauri info` para diagnosticar o ambiente, `tauri icon <imagem.png>` para gerar os icones).

## Problemas comuns

- **`link.exe not found` / erro de linker**: faltou a carga "Desktop development with C++" do Build Tools, ou o Rust nao esta no toolchain MSVC (`rustup default stable-msvc`).
- **`cargo`/`pnpm` nao reconhecido**: reabra o terminal apos instalar.
- **Janela em branco**: atualize/instale o WebView2 Runtime.
- **Diagnostico geral**: `pnpm --filter @cyl/desktop tauri info` mostra o que esta faltando.

## Linux (CI / desenvolvimento)

O alvo do produto e Windows, mas o codigo compila no Linux (usado para verificacao). Dependencias de sistema (Debian/Ubuntu):

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev pkg-config build-essential
```

Checagem do lado Rust: `cd apps/desktop/src-tauri && cargo check`. O instalador NSIS so e gerado no Windows.

## Documentacao

- [CLAUDE.md](CLAUDE.md) - guia e regras do projeto
- [docs/architecture/](docs/architecture/) - arquitetura e criterios de aceite
- [docs/decisions/](docs/decisions/) - decisoes (ADRs)
- [docs/compliance/](docs/compliance/) - limites de uso de dados e Riot

## Status

P0-01 (bootstrap do desktop): verificado no Linux (typecheck, testes, build web, `cargo check`/clippy e binario nativo); falta validar `pnpm dev` e `pnpm build` no Windows. Veja o backlog em [CLAUDE.md](CLAUDE.md) e o aceite em [docs/architecture/p0-01-aceite.md](docs/architecture/p0-01-aceite.md).
