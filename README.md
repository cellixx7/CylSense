# CYL Sense

> Understand your game. Elevate your play.

Plataforma de analise de desempenho para jogadores de VALORANT. Transforma estatisticas de partidas e videos importados em diagnosticos justificaveis e recomendacoes de treino.

| Produto | Pasta | Papel |
|---|---|---|
| Web | `apps/web` | Site institucional, login Riot (quando aprovado), historico e analises iniciais |
| Desktop | `apps/desktop` | Ferramenta principal (Windows, Tauri 2), local-first e offline |
| API | `services/api` | Autenticacao, integracao Riot, sincronizacao |

## Requisitos

| Ferramenta | Versao | Para que serve |
|---|---|---|
| Node.js | >= 22.9 (LTS) | front-end, site, API e scripts |
| pnpm | 10.28.0 (fixado em `package.json`) | gerenciador de pacotes do monorepo |
| Rust (toolchain MSVC) | stable, >= 1.77 | backend nativo do Tauri (so para o desktop) |
| Visual Studio Build Tools | 2022, carga "Desktop development with C++" | linker/compilador C++ exigido pelo Rust no Windows |
| WebView2 Runtime | atual | motor de renderizacao da janela (ja vem no Windows 10/11 atualizado) |

Para trabalhar so no site e na API bastam Node.js e pnpm. A CLI do Tauri (`@tauri-apps/cli`) **ja e dependencia do projeto** e e instalada pelo `pnpm install`; nao precisa instalar globalmente nem via `cargo install`. O NSIS (gerador do instalador) e baixado automaticamente pelo Tauri no primeiro `pnpm build`.

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
pnpm dev:demo   # site em http://localhost:3000 + API em modo demonstracao (dados sinteticos)
pnpm dev        # janela desktop Tauri (a 1a compilacao do Rust leva alguns minutos)
```

Nenhuma credencial ou servico externo e necessario. A integracao Riot fica desativada ate a aprovacao oficial.

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` | app desktop Tauri em modo desenvolvimento (Vite + janela nativa, com hot reload) |
| `pnpm dev:web` | so o front-end **do desktop** no navegador, em http://localhost:1420 (nao precisa de Rust) |
| `pnpm build` | gera o instalador Windows (NSIS) em `apps/desktop/src-tauri/target/release/bundle/nsis/` |
| `pnpm build:web` | build so do front-end do desktop em `apps/desktop/dist/` |
| `pnpm dev:site` | site Next.js (`apps/web`) em http://localhost:3000 |
| `pnpm build:site` | build de producao do site |
| `pnpm dev:api` | API (`services/api`) em http://127.0.0.1:4000, integracao Riot desativada |
| `pnpm dev:demo` | API em modo mock + site juntos (login e partidas **sinteticos**) |
| `pnpm typecheck` | checagem TypeScript (strict) em todos os workspaces |
| `pnpm test` | testes (Vitest) em todos os workspaces |

Para rodar outros comandos da CLI do Tauri: `pnpm --filter @cyl/desktop tauri <comando>` (ex.: `tauri info` para diagnosticar o ambiente, `tauri icon <imagem.png>` para gerar os icones). Variaveis de ambiente opcionais: `services/api/.env.example` e `apps/web/.env.example`.

## Problemas comuns

- **`link.exe not found` / erro de linker**: faltou a carga "Desktop development with C++" do Build Tools, ou o Rust nao esta no toolchain MSVC (`rustup default stable-msvc`).
- **`cargo`/`pnpm` nao reconhecido**: reabra o terminal apos instalar.
- **Janela em branco**: atualize/instale o WebView2 Runtime.
- **API nao inicia com `CYL_AUTH_MODE=mock`**: o modo mock e recusado com `NODE_ENV=production` (comportamento esperado).
- **Diagnostico geral**: `pnpm --filter @cyl/desktop tauri info` mostra o que esta faltando.

## Linux (CI / desenvolvimento)

O alvo do desktop e Windows, mas o codigo compila no Linux (usado para verificacao). Dependencias de sistema (Debian/Ubuntu):

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev pkg-config build-essential
```

Checagem do lado Rust: `cd apps/desktop/src-tauri && cargo check`. O instalador NSIS so e gerado no Windows.

## Documentacao

- [CLAUDE.md](CLAUDE.md): guia e regras do projeto
- [docs/roadmap.md](docs/roadmap.md): roadmap e status
- [docs/architecture/](docs/architecture/): arquitetura, API e criterios de aceite
- [docs/decisions/](docs/decisions/): decisoes (ADRs)
- [docs/ux/](docs/ux/): jornadas, navegacao, fluxos e especificacoes de tela
- [docs/compliance/](docs/compliance/): Riot e dados pessoais
- [docs/prompts/](docs/prompts/): prompts para as proximas tarefas no Claude Code

## Status

- P0-01 (bootstrap do desktop): concluido, verificado no Linux e no Windows ([aceite](docs/architecture/p0-01-aceite.md)).
- v0.2 (fundacao Web/Desktop/API): concluida ([estado e migracao](docs/architecture/v0.2-estado-e-migracao.md)).
- P0-02 (contratos e dominio): concluido ([aceite](docs/architecture/p0-02-aceite.md)).
- Proximo: P0-03 (SQLite e migracoes). Backlog completo em [docs/roadmap.md](docs/roadmap.md).

CYL Sense nao e afiliado a Riot Games.
