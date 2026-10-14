# P0-04 - Importacao de partidas e historico local

**Prioridade**: Critica | **Esforco**: M

## Escopo

Primeira experiencia funcional da secao Partidas no desktop: selecionar um arquivo JSON compativel, ver o resultado da validacao, gravar no SQLite, consultar o historico e abrir o detalhe de uma partida, tudo offline. Fora do escopo: Riot (RSO/API), leitura de pastas ou memoria do VALORANT, replays, analytics (P0-05), coaching (P0-08), video (P0-07), PostgreSQL, sincronizacao, redesign.

Decisao: [ADR 0005](../decisions/0005-arquivos-do-usuario-lidos-pelo-rust.md). Detalhes tecnicos: [importacao de partidas](match-import.md). Persistencia: [persistencia local](local-persistence.md).

## Criterio de aceite

Selecionar arquivo compativel; entradas invalidas rejeitadas; partidas validas persistidas; duplicatas identificadas; historico atualizado; detalhe disponivel; dados mantidos apos reiniciar; funciona offline; testes relevantes passando; desktop estavel.

## Implementado

| Area | Arquivos |
|---|---|
| Dialogo nativo + leitura segura (so `.json`, limite com teto, UTF-8, erros sem caminho) | `apps/desktop/src-tauri/src/import_file.rs`, `commands.rs` (`import_pick_file`) |
| Gravacao em lote atomica (uma transacao, regras do `match_save`) | `storage/matches.rs` (`save_matches`), `commands.rs` (`match_save_batch`) |
| Listagem com `externalId` e placar | `storage/matches.rs` (`list_matches`) |
| Pipeline de importacao (formatos, limites, origem, duplicidade) | `apps/desktop/src/import/import-file.ts` |
| Ponte do seletor nativo | `apps/desktop/src/import/picker.ts` |
| `LocalStore.saveMatches`, listagem validada (`MatchResult`) | `apps/desktop/src/storage/local-store.ts` |
| Secao Partidas: historico, importacao, detalhe | `apps/desktop/src/pages/matches/` |
| Rodape atualizado apos importar | `storage/useStorageStatus.ts`, `App.tsx` |
| Store em memoria para testes | `apps/desktop/src/test/memory-store.ts` |

Dependencia nova: `tauri-plugin-dialog` 2 (Rust; usado so pelo lado nativo, sem permissao JS na capability). Nenhuma dependencia JS nova. Nenhuma migracao nova (schema SQLite continua v1); contratos continuam 1.1.0.

## Interface

- **Historico**: tabela (partida = mapa · modo + `externalId`, jogo, data, resultado, origem, importada em); estados de carregamento, vazio e erro com "Tentar novamente". Origem sempre visivel; `Sintetico` destacado.
- **Importar**: explica formatos e limite -> "Escolher arquivo JSON" -> previa validada (arquivo, formato, origem, partidas, aviso de dado sintetico) -> "Importar N partidas" ou "Cancelar" -> resultado (novas / ja importadas / atualizadas, "Abrir" por partida) ou erro ("Arquivo recusado" / "Falha ao gravar", "Nenhuma partida foi gravada").
- **Detalhe**: informacoes gerais, cobertura dos dados (eventos completa/parcial e o que esta disponivel), times e participantes, rodadas, eventos. Ausente aparece como "Nao informado"; colunas de headshot/dano so quando existem. Sem metricas derivadas, hipoteses ou recomendacoes.
- Fora do app Tauri (`pnpm dev:web`), a secao explica que o historico e local.

## Resultado da verificacao (2026-10-14, Windows 10 Pro 19045)

### Antes

Branch `claude/vibrant-gauss-5lxtsf` limpa e alinhada com `origin` em `e4b56a3` (P0-03 ja publicado); porta 1420 livre; nenhum `cyl-sense.exe` em execucao.

### Comandos

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | OK nos 6 workspaces |
| `pnpm test` | OK: **123 testes** (contracts 27, core 6, valorant 11, api 16, web 6, desktop **57**; eram 17) |
| `cargo test` (src-tauri) | OK: **54 testes** (eram 39: +8 leitura de arquivo, +6 lote, +1 listagem) |
| `cargo clippy --all-targets -- -D warnings` | OK, sem avisos |
| `cargo fmt --check` | OK |
| `pnpm build:web` | OK; semente de desenvolvimento fora do bundle |
| Busca de segredos no diff `e4b56a3..HEAD` | nada encontrado |
| `pnpm build` (instalador) | **nao executado** (ver pendencias) |

### Cobertura dos testes

- TS, pipeline: fixtures validas; ausente continua ausente (`syn-0002`); pacote local com ids novos; extensao maiuscula; JSON invalido sem eco do conteudo; extensao recusada; arquivo grande (tamanho declarado e real); raiz nao objeto; formato desconhecido; `formatVersion`/`schemaVersion` incompativeis; as 4 fixtures inconsistentes de `invalid/`; campo obrigatorio ausente; origem `riot_api` e origem divergente; pacote vazio, repetido, acima do limite e com videos; gravacao + reimportacao sem duplicar; pacote com varias partidas; falha do banco sem gravacao; seletor (so envia o limite, cancelamento, erros nativos, erro desconhecido generico).
- TS, UI: historico carregando/vazio/erro/registros; previa sintetica e cancelar; importar e atualizar historico; reimportar sem duplicar; arquivo invalido sem expor conteudo; partida inconsistente; erro de permissao; dialogo cancelado; falha do banco ao gravar; detalhe completo; detalhe com dados ausentes; partida inexistente; navegacao no `App`.
- Rust: leitura (`.json` valido, BOM, extensoes recusadas, limite e teto, UTF-8, inexistente, diretorio, permissao, mensagens sem caminho/conteudo); lote (grava tudo e reimportacao `unchanged` com persistencia apos reabrir; item invalido e conflito no banco desfazem o lote; vazio/repetido/excesso; origens diferentes; falha de gravacao); listagem com `externalId` e placar opcional.

### Desktop no Windows (`pnpm dev`, somente Tauri)

Banco isolado no scratchpad via `CYL_SENSE_DATA_DIR`, sem semente; nenhum dado real tocado. Janela operada por UI Automation; banco conferido com `node:sqlite` somente leitura.

| Passo | Resultado observado |
|---|---|
| 1-2. Abrir app e Partidas | log `banco pronto: schema v1 (migrado de v0), 0 partidas`; estado vazio |
| 3-4. Importar `syn-0001.json` pelo dialogo nativo | previa: formato `cyl-synthetic-valorant`, origem `Sintetico`, aviso de dado sintetico; apos confirmar: 1 linha no banco, historico com `syn-0001` |
| 5-6. Importar de novo | "Nenhuma partida nova: o arquivo ja tinha sido importado" (0 novas, 1 ja importada); banco com 1 linha, mesmo id e `updated_at` |
| extra: `syn-0002.json` | importada; detalhe sem colunas de headshot/dano, placar "Vermelho 1 x 1 Azul (empate)", cobertura parcial |
| 7. Detalhe | informacoes gerais, cobertura, times, rodadas, eventos (8: 5 abates, 2 plants, 1 defuse) |
| 11. Arquivo invalido (JSON quebrado com o texto `SEGREDO-123`) | "Arquivo recusado - O arquivo nao contem JSON valido - Nenhuma partida foi gravada"; o texto do arquivo nao aparece na tela; banco continua com 2 |
| 8. Fechar (WM_CLOSE) | processo encerrado; WAL 0 bytes; `integrity_check` ok; `foreign_key_check` vazio |
| 9-10. Reabrir | log `schema v1 (migrado de v1), 2 partidas`; rodape `banco v1 · 2 partidas`; historico com as 2; detalhe de `syn-0001` abre ("Vermelho 2 x 1 Azul (vitoria vermelho)") |

Logs: apenas linhas `[cyl-storage]` sem caminhos nem conteudo; nenhum panic. Ao fechar, o `pnpm dev` termina com `ELIFECYCLE ... 4294967295`: e o Vite sendo encerrado pelo `tauri dev` depois que a janela fecha, nao uma falha do app. Ao final: nenhum `cyl-sense.exe`, porta 1420 livre.

Ocorrencias durante a validacao:

- A primeira gravacao de `syn-0001` aconteceu cerca de 3 s depois da previa, antes do comando de confirmacao da automacao; foi provavelmente um clique manual na janela. O resultado foi o esperado (1 linha) e o fluxo de confirmacao foi exercitado depois, nas importacoes seguintes.
- A primeira versao da automacao usava teclas simuladas (`SendKeys`) no dialogo; numa tentativa o dialogo nao estava em primeiro plano e o app recebeu "cancelado". As teclas (Alt+N, Ctrl+A, Ctrl+V com o caminho do arquivo de teste, Enter) podem ter ido para outra janela. O working tree continuou limpo; a automacao passou a usar apenas UI Automation e mensagens Win32 dirigidas ao proprio dialogo.

### Nao verificado

- Instalador NSIS e executavel de release com o plugin de dialogo (so a build de debug foi exercitada).
- Arquivos acima de 5 MiB e erro de permissao real do sistema no app (cobertos por testes Rust/TS, nao na janela).
- Console do WebView2.

## Pendencias

- **Instalador**: o P0-04 adiciona um plugin nativo; gerar e testar `pnpm build` antes de distribuir (junto com a instalacao do NSIS pendente do P0-03). Responsavel: P0-09.
- Importacao de videos/marcacoes por pacote e exportacao de `cyl-local-bundle` (o formato existe, sem gerador).
- Sem exclusao de partidas, paginacao do historico (mostra ate 200) e filtros.
- Limites de importacao configuraveis so por codigo (sem tela de Configuracoes).
- Textos da UI sem acentuacao, seguindo o restante do app; revisar no design system.
- Dados reais continuam bloqueados por R-01/R-02 (Production Key + RSO).

## Proximo passo

P0-05 - Analytics Engine (`MatchMetrics` deterministicas; pacote `@cyl/analytics`), consultando `matchDataAvailability` em vez de tratar ausente como zero.
