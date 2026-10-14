# Importacao de partidas (desktop)

Introduzida no P0-04. Funciona offline, somente com arquivos locais escolhidos pelo usuario. Nao le pastas do VALORANT, nao chama a Riot e nao aceita arquivos que se apresentem como dados oficiais.

## Formatos aceitos

| Formato | Versao | Conteudo | Origem gravada |
|---|---|---|---|
| `cyl-synthetic-valorant` (campo `format`) | `formatVersion: 1` | 1 partida no formato sintetico de `@cyl/game-adapter-valorant` (as fixtures de `fixtures/valorant/`) | sempre `synthetic` |
| `cyl-local-bundle` (campo `kind`) | `schemaVersion: 1` | `LocalImportEnvelope` de `@cyl/contracts`: partidas ja normalizadas (`Match`) | a declarada no pacote: `synthetic` ou `user_import` |

Recusado: qualquer outro formato; versao diferente das acima; pacote com origem `riot_api` (dado oficial so chega pela integracao autorizada, R-01/R-02); pacote com `videos` ou `markers` (ainda nao importados); payloads da Riot ou de outros programas.

Extensao `.json` (maiusculas ou minusculas), texto UTF-8 (BOM aceito e removido).

## Fluxo

```
[Importar partida] -> [Escolher arquivo JSON]
  Rust: dialogo nativo (filtro .json) -> extensao -> tamanho -> leitura limitada -> UTF-8      (import_pick_file)
  TS:   extensao + tamanho de novo -> JSON.parse -> formato/versao
        -> sintetico: adaptador VALORANT (Zod do formato + Zod do Match)
        -> pacote:    LocalImportEnvelope (Zod) -> regras de origem -> ids locais novos
        -> regras do arquivo: >= 1 partida, <= maxMatches, sem partida repetida, origem unica, nunca riot_api
  UI:   previa (arquivo, formato, origem, partidas; aviso de dado sintetico) -> [Importar N partidas] ou [Cancelar]
  TS:   LocalStore.saveMatches (revalida cada Match com Zod)
  Rust: match_save_batch -> uma transacao SQLite                                             (lote atomico)
  UI:   resultado (novas / ja importadas / atualizadas) -> historico e rodape atualizados
```

Decisao: [ADR 0005](../decisions/0005-arquivos-do-usuario-lidos-pelo-rust.md).

Codigo: `apps/desktop/src-tauri/src/import_file.rs`, `commands.rs` (`import_pick_file`, `match_save_batch`), `storage/matches.rs` (`save_matches`), `apps/desktop/src/import/` (`import-file.ts`, `picker.ts`), `apps/desktop/src/pages/matches/`.

### Por que o dialogo e aberto no Rust

O front-end nunca envia um caminho de arquivo: o comando `import_pick_file` abre o dialogo nativo (`tauri-plugin-dialog`, usado so pelo lado Rust), le o arquivo escolhido e devolve `{ name, sizeBytes, content }` (nome sem diretorio) ou `null` se o usuario cancelar. Nao ha plugin de sistema de arquivos nem permissao JS nova: a capability continua `core:default`, entao os comandos JS do plugin de dialogo ficam negados.

## Limites

| Limite | Padrao | Onde |
|---|---|---|
| Tamanho do arquivo | 5 MiB (`DEFAULT_IMPORT_LIMITS.maxBytes`) | o front-end pede o limite; o Rust aplica teto absoluto de 20 MiB (`HARD_MAX_BYTES`) e le no maximo `limite + 1` bytes |
| Partidas por arquivo | 200 (`maxMatches`) | TS; o Rust recusa lotes acima de 200 (`BATCH_MAX`) |

Os limites sao configuraveis por `ImportLimits` (`MatchesPage`/`MatchImport` aceitam `limits`); nao ha tela de configuracao ainda.

## Politica de gravacao: atomica

Um arquivo e gravado inteiro ou nao e gravado: a validacao roda em todas as partidas antes de qualquer escrita, e a gravacao usa uma unica transacao (`save_matches`). Qualquer erro (dado invalido, conflito, falha de escrita) desfaz o lote e a UI informa "Nenhuma partida foi gravada".

## Deduplicacao

Reaproveita a idempotencia do P0-03 (identidade = `game` + `origin` + `externalId`):

| Caso | Resultado |
|---|---|
| Partida nova | `inserted` |
| Mesmo arquivo de novo | `unchanged`: nenhum registro novo, mesmo id local, `updated_at` inalterado; a UI diz "o arquivo ja tinha sido importado" |
| Mesma identidade, conteudo diferente | `updated` (mantem id local e `imported_at`; regras de `match_save`) |
| Mesmo `externalId`, origens diferentes | registros separados (nao se misturam) |
| Mesma partida duas vezes no arquivo | arquivo recusado (`duplicate_in_file`) |
| Partida sem `externalId` | recusada pela validacao; nenhum id externo e inventado |

Ids locais: o adaptador gera um id novo a cada normalizacao, e pacotes recebem ids novos (o id de outro banco poderia colidir). O id definitivo e o devolvido pela gravacao.

Campos opcionais ausentes no arquivo continuam ausentes no banco e na tela ("Nao informado"; colunas de headshot/dano so aparecem quando todos os participantes as tem).

## Erros

Toda mensagem e segura para a UI e para log: nunca inclui trechos do arquivo (a mensagem do `JSON.parse` e descartada), caminhos ou a mensagem bruta do SQLite/sistema. Erros de validacao Zod citam so o caminho do campo e o motivo (ate 3).

| Codigo | Quando |
|---|---|
| `unsupported_file` | extensao diferente de `.json`, ou o item escolhido nao e arquivo |
| `too_large` | acima do limite |
| `not_found` / `permission_denied` / `read_failed` | erro do sistema ao ler |
| `not_utf8` | conteudo nao e texto UTF-8 |
| `invalid_json` | JSON malformado |
| `unsupported_format` | formato desconhecido, raiz que nao e objeto, pacote com videos/marcacoes |
| `incompatible_version` | `formatVersion`/`schemaVersion` nao suportados |
| `invalid_origin` | `riot_api` declarada, ou origens misturadas |
| `invalid_data` | falha de schema ou de consistencia (placar, rounds, eventos...), arquivo sem partidas |
| `duplicate_in_file` / `too_many_matches` | regras do arquivo |
| `storage` | falha ao gravar (traz o `code` do armazenamento; nada foi gravado) |

## Nao suportado (ainda)

- Payload da Riot API, pastas/arquivos do VALORANT, replays proprietarios, outros jogos.
- Importacao de videos e marcacoes por pacote (P0-07).
- Exportacao de `cyl-local-bundle` pelo app (o formato existe no contrato, mas nao ha gerador).
- Varios arquivos de uma vez, arrastar e soltar, exclusao de partidas.
