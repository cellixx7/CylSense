# P0-03 - SQLite, persistencia e migracoes

**Prioridade**: Critica | **Esforco**: M

## Escopo

Persistencia local confiavel no desktop: banco SQLite no diretorio de dados do app, migracoes versionadas e seguras, repositorio de partidas (idempotente), referencias de video e marcacoes manuais. Fora do escopo: PostgreSQL, importacao de arquivos pela interface (P0-04), analytics, dashboard, processamento de video, IA, nuvem.

Decisao: [ADR 0004](../decisions/0004-sqlite-local-e-postgresql-no-backend.md). Detalhes tecnicos: [persistencia local](local-persistence.md).

## Criterio de aceite

SQLite inicializa no Windows, dados persistem apos reiniciar, migracoes versionadas e seguras, operacoes testadas, duplicatas identificadas, videos e marcacoes com integridade referencial, contratos respeitados, builds e testes passando, nenhuma dependencia de internet.

## Implementado

| Area | Arquivos |
|---|---|
| Abertura, integridade, PRAGMAs, exportacao, checkpoint | `apps/desktop/src-tauri/src/storage/mod.rs` |
| Erros seguros (sem caminho/SQL/valores) | `storage/error.rs` |
| Migracoes (transacao, checksum, backup, versao incompativel) | `storage/migrations.rs`, `storage/migrations/0001_initial_schema.sql` |
| Partidas (idempotencia, conflitos, leitura revalidada) | `storage/matches.rs` |
| Videos e marcacoes | `storage/videos.rs` |
| Testes Rust (bancos temporarios isolados) | `storage/tests.rs` |
| Comandos Tauri, estado tolerante a falha, checkpoint ao sair | `src/commands.rs`, `src/lib.rs` |
| Repositorio TS (`LocalStore`) com validacao Zod na ida e na volta | `apps/desktop/src/storage/local-store.ts`, `native.ts` |
| Diagnostico: rodape com estado do banco; semente sintetica so em dev | `storage/useStorageStatus.ts`, `storage/dev-seed.ts`, `App.tsx` |

Dependencias novas (somente Rust): `rusqlite` 0.40 (`bundled`) e `tempfile` 3 (dev). Nenhuma dependencia JS nova.

## Banco

- Local: `%LOCALAPPDATA%\gg.cyl.sense\data\cyl-sense.db` (release). Debug aceita `CYL_SENSE_DATA_DIR`.
- Tabelas: `matches`, `video_references`, `video_markers`, `app_metadata`, `schema_migrations` (todas `STRICT`).
- Versoes: schema SQLite **1**; contratos gravados **1.1.0**; `Match.schemaVersion` **1** - independentes entre si.

## Resultado da verificacao (2026-10-14, Windows 10 Pro 19045, Node 24.20, pnpm 10.28, Rust 1.99)

### Antes

Branch `claude/vibrant-gauss-5lxtsf` limpa, alinhada com `origin` (`07b2b8d`); portas 1420/3000/4000 livres; nenhum `cyl-sense.exe` em execucao.

### Comandos

| Comando | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | OK (lockfile inalterado) |
| `pnpm typecheck` | OK nos 6 workspaces |
| `pnpm test` | OK: **83 testes** (contracts 27, core 6, valorant 11, api 16, web 6, desktop **17**) |
| `cargo test` (src-tauri) | OK: **39 testes** (38 de persistencia + `app_info`) |
| `cargo clippy --all-targets -- -D warnings` | OK, sem avisos |
| `cargo fmt` | aplicado |
| `pnpm build:web` | OK; a semente de desenvolvimento nao entra no bundle (busca por `synthetic-demo` no `dist` vazia) |
| `pnpm build:site` | OK; mesmas rotas do P0-02 |
| `pnpm build` | OK: `CYL Sense_0.1.0_x64-setup.exe` (3,05 MiB) |

### Cobertura dos testes Rust

Criacao (diretorio, schema, FK ligada, WAL); persistencia apos reabrir; migracoes nao reaplicadas; atualizacao v1->v2 sem perda e com backup valido; migracao com falha revertida (nenhum objeto parcial) e detectada; banco de versao mais nova recusado com mensagem clara; migracao alterada recusada; lista fora de sequencia; nenhuma migracao destrutiva; banco inacessivel (diretorio no lugar do arquivo, pai que e arquivo) sem panico e sem caminho na mensagem; arquivo nao SQLite e paginas corrompidas => `corrupt`, arquivo intacto; exportacao consistente que nao sobrescreve; mesma partida duas vezes; partidas distintas; origens distintas com o mesmo `externalId`; identificadores ausentes; atualizacao compativel (mantem id e `imported_at`); id local em uso; atualizacao que removeria round marcado; versoes nao suportadas; JSON invalido e campo extra na entrada; dados parciais continuam ausentes; JSON adulterado detectado na leitura; erro durante transacao sem registro parcial; falha de gravacao (`query_only`) com leitura funcionando e recuperacao; listagem ordenada; video idempotente e sem partida; referencias de video invalidas; FK aplicada pelo banco; partida com video nao pode ser apagada; ciclo de vida das marcacoes; marcacoes invalidas; formato JSON alinhado aos contratos; checkpoint do WAL.

### Desktop no Windows (fluxo de teste controlado)

Banco isolado no scratchpad via `CYL_SENSE_DATA_DIR` (nenhum dado real tocado), inspecionado com `node:sqlite` em modo somente leitura.

| Passo | Resultado observado |
|---|---|
| 1. `VITE_CYL_DEV_SEED=1 pnpm dev` | log `banco pronto: schema v1 (migrado de v0), 0 partidas`; janela abre |
| 2. Semente | 2 partidas `synthetic` (`syn-0001`, `syn-0002`, contratos 1.1.0) gravadas. A 1a execucao da semente **falhou ao associar o video**: o literal do caminho perdeu as barras invertidas e o Rust recusou o caminho relativo (`invalid_data`) - comportamento correto da validacao; corrigido em `6b94087` com teste. Apos o recarregamento: 1 video + 1 marcacao (round 1) |
| 3. Reinicios durante a correcao (watcher do Tauri) | 3 reaberturas: sempre `migrado de v1`, 2 partidas - sem reaplicar migracao nem perder dados |
| 4. Fechar (WM_CLOSE) e reabrir **com** a semente | `2 partidas, 1 videos, 1 marcacoes`; mesmos ids e `updated_at` (resultado `unchanged`), nada duplicado. Rodape: `contratos 1.1.0 · banco v1 · 2 partidas · offline` |
| 5. Fechar | WAL truncado (0 bytes), `.db` com 64 KB; `integrity_check` ok, `foreign_key_check` vazio |
| 6. Reabrir **sem** a semente | `2 partidas, 1 videos, 1 marcacoes` |
| 7. Banco corrompido (8 KB aleatorios, diretorio isolado) | app abre; log `banco indisponivel: Corrupt ... preservado`; rodape `banco indisponivel`; md5 do arquivo inalterado |
| 8. Executavel de release, caminho padrao | cria `%LOCALAPPDATA%\gg.cyl.sense\data\cyl-sense.db` (antes inexistente), schema v1, vazio, integridade ok |

Logs: somente as linhas `[cyl-storage]` acima (sem caminhos, sem conteudo de partidas); nenhum erro bloqueante, nenhum panic. Ao final: nenhum `cyl-sense.exe` ou Vite residual, porta 1420 livre.

### Nao verificado

- Instalacao do NSIS gerado (o executavel de release foi aberto direto do `target`).
- Console do WebView2 (sem DevTools automatizado); o resultado da semente foi conferido no banco e no rodape.
- Banco em disco cheio ou somente leitura no nivel do sistema operacional (simulado com `query_only` nos testes).

## Pendencias

- Recuperacao de banco corrompido e manual (arquivo preservado); exportacao (`export_copy`) sem comando/UI.
- Sem exclusao de partidas/videos (sem fluxo que peca; FKs `RESTRICT`).
- Banco vazio criado pelo passo 8 permanece em `%LOCALAPPDATA%\gg.cyl.sense\data` (estado normal do primeiro uso do app).

## Proximo passo

P0-04 - importacao de partidas (fixtures sinteticas e arquivos do usuario via `@cyl/game-adapter-valorant`, gravando por `LocalStore.saveMatch`).
