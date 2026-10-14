# ADR 0004 - SQLite local no desktop (rusqlite) e PostgreSQL no backend futuro

- Status: aceita
- Data: 2026-10-14
- Relacionadas: [ADR 0001](0001-stack-e-escopo-p0.md), [ADR 0002](0002-separacao-web-desktop-api.md), [ADR 0003](0003-consistencia-e-cobertura-do-dominio.md)

## Contexto

O desktop e local-first: precisa guardar partidas normalizadas, referencias de video e marcacoes manuais, funcionar offline e sobreviver a atualizacoes do app sem perder dados. A API, no futuro, guardara contas, sessoes, partidas sincronizadas e a integracao Riot autorizada.

## Decisao

### Dois bancos, papeis distintos

| Banco | Onde | Guarda | Quando |
|---|---|---|---|
| **SQLite** | Desktop (arquivo local do usuario) | Partidas, referencias de video, marcacoes, metadados de armazenamento | P0-03 (agora) |
| **PostgreSQL** | API (`services/api`) | Contas, autenticacao, partidas sincronizadas, historico em nuvem, tokens Riot cifrados | A-01 (nao implementado nesta etapa) |

Os dois nao compartilham schema: o elo e o contrato `Match` de `@cyl/contracts` e a identidade (`game`, `origin`, `externalId`).

### Integracao SQLite no Tauri 2

| Opcao | Seguranca | Migracoes | Testabilidade | Sobrecarga |
|---|---|---|---|---|
| Plugin SQL oficial (`tauri-plugin-sql`, sqlx) | Expoe `execute`/`select` com SQL arbitrario ao WebView; restringir exige filtrar SQL | Lista do plugin, aplicadas na carga | Precisa do runtime Tauri ou de mocks do plugin | sqlx + tokio, pool assincrono |
| **Comandos Rust proprios + `rusqlite` (bundled)** | **Superficie fechada: so comandos tipados**, entrada desserializada com `deny_unknown_fields` | Proprias: `user_version` + `schema_migrations` com checksum, transacao por migracao, backup antes de atualizar | `cargo test` puro com bancos temporarios, sem Tauri | Uma conexao sincrona; SQLite compilado junto (mesma versao no Windows) |
| Outra biblioteca nativa (sqlx direto, diesel) | Igual a anterior | sqlx/diesel trazem migradores proprios | Igual | Maior (async/ORM sem necessidade) |

**Escolhido: comandos Rust + `rusqlite` com o recurso `bundled`.** O front-end nunca envia SQL. A persistencia fica no modulo `apps/desktop/src-tauri/src/storage` (repositorio) e e exposta por `commands.rs`. No TypeScript, `LocalStore` (`apps/desktop/src/storage/local-store.ts`) e a interface de repositorio consumida pela UI.

O `LocalStore` fica no desktop, nao em `@cyl/core`, porque carrega DTOs exclusivamente locais (`localPath`, datas de armazenamento). Se a API ganhar um repositorio equivalente (A-01), a porta comum sobe para `@cyl/core`.

### Armazenamento

- Partida = **JSON completo do `Match`** em `matches.data_json`, mais colunas extraidas para identidade, ordenacao e versao. O contrato ainda evolui (ADR 0003) e o motor de analytics le a partida inteira; normalizar participantes, rounds e eventos em tabelas nao tem consumidor hoje e transformaria cada mudanca aditiva do contrato em migracao.
- Validacao em duas camadas: Zod (`Match`) no TypeScript antes de gravar e depois de ler; no Rust, checagem minima de identidade e versao (`schemaVersion`, `id`, `externalId`, `game`, `origin`) e `CHECK (json_valid(...))` no banco.
- Videos nunca entram no banco: so caminho absoluto, nome, duracao e offset.

### Versoes independentes

| Versao | Onde | Hoje |
|---|---|---|
| Schema SQLite | `PRAGMA user_version` + `schema_migrations` | 1 |
| Contratos Zod (`CONTRACTS_VERSION`) | `matches.contracts_version` (gravada a cada escrita) | 1.1.0 |
| Agregado (`Match.schemaVersion`) | `matches.match_schema_version` | 1 |

Uma nao implica a outra: mudanca aditiva nos contratos (MINOR) nao exige migracao SQLite; mudanca de MAJOR ou de `schemaVersion` exige revisar o lado Rust (hoje recusa com `incompatible_schema`).

### Identidade e conflitos

Identidade de deduplicacao = (`game`, `origin`, `externalId`), com `UNIQUE` no banco. Origem faz parte da chave: dado sintetico nunca se funde com dado real. Titulo, mapa ou horario nao sao usados como identidade. Sem `externalId` a partida e recusada (o contrato ja o exige).

## Consequencias

- Adicionar jogo ou origem exige atualizar as listas conhecidas no Rust (`matches.rs`), sem migracao.
- Migracoes publicadas nunca sao editadas (checksum); mudancas entram como novas migracoes, somente aditivas, com backup automatico antes de atualizar.
- O PostgreSQL da API seguira o mesmo principio (migracoes versionadas, nao destrutivas) quando A-01 comecar.
