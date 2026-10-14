//! Partidas normalizadas (contrato `Match`).
//!
//! O JSON completo e validado com Zod no front-end antes de gravar e depois de
//! ler. Aqui conferimos o minimo necessario para identidade e versionamento,
//! sem duplicar as regras do contrato.

use super::error::{sql, StorageError, StorageErrorCode, StorageResult};
use super::Storage;
use rusqlite::{params, OptionalExtension, Row, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashSet;

/// `schemaVersion` de `Match` que esta build sabe gravar.
pub const SUPPORTED_MATCH_SCHEMA_VERSION: u64 = 1;
/// MAJOR de `CONTRACTS_VERSION` aceito (mudanca de MAJOR exige migracao).
pub const SUPPORTED_CONTRACTS_MAJOR: u64 = 1;
const KNOWN_GAMES: &[&str] = &["valorant"];
const KNOWN_ORIGINS: &[&str] = &["synthetic", "riot_api", "user_import"];
const LIST_MAX: u32 = 500;
/// Maximo de partidas por lote em `save_matches`.
pub const BATCH_MAX: usize = 200;

pub(super) const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveMatchInput {
    /// `Match` ja validado pelo front-end.
    #[serde(rename = "match")]
    pub data: Value,
    /// `CONTRACTS_VERSION` usado para validar.
    pub contracts_version: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SaveMatchOutcome {
    Inserted,
    /// Mesma partida, mesmo conteudo: nada foi escrito.
    Unchanged,
    Updated,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveMatchResult {
    /// Id local definitivo (o da partida ja gravada, em caso de reimportacao).
    pub id: String,
    pub outcome: SaveMatchOutcome,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredMatch {
    pub id: String,
    pub game: String,
    pub origin: String,
    pub external_id: String,
    pub match_schema_version: u64,
    pub contracts_version: String,
    pub imported_at: String,
    pub updated_at: String,
    #[serde(rename = "match")]
    pub data: Value,
}

/// Linha de listagem (compativel com `MatchSummary` + datas locais).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchListItem {
    pub id: String,
    pub game: String,
    pub origin: String,
    pub external_id: String,
    pub map: String,
    pub mode: String,
    pub started_at: String,
    pub duration_seconds: i64,
    pub rounds_played: i64,
    /// `MatchResult` gravado (o front-end valida com o contrato); ausente = nao informado.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    pub imported_at: String,
    pub updated_at: String,
}

struct Identity<'a> {
    id: &'a str,
    game: &'a str,
    origin: &'a str,
    external_id: &'a str,
    schema_version: u64,
    started_at: &'a str,
}

fn str_field<'a>(obj: &'a Map<String, Value>, key: &str) -> StorageResult<&'a str> {
    match obj.get(key) {
        Some(Value::String(s)) if !s.trim().is_empty() => Ok(s),
        Some(_) => Err(StorageError::invalid(format!("campo `{key}` invalido"))),
        None => Err(StorageError::invalid(format!("campo `{key}` ausente"))),
    }
}

fn identity(data: &Value) -> StorageResult<Identity<'_>> {
    let obj = data
        .as_object()
        .ok_or_else(|| StorageError::invalid("a partida deve ser um objeto JSON"))?;
    let schema_version = obj
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .ok_or_else(|| StorageError::invalid("campo `schemaVersion` ausente ou invalido"))?;
    if schema_version != SUPPORTED_MATCH_SCHEMA_VERSION {
        return Err(StorageError::new(
            StorageErrorCode::IncompatibleSchema,
            format!("schemaVersion {schema_version} da partida nao e suportado (esperado {SUPPORTED_MATCH_SCHEMA_VERSION})"),
        ));
    }
    let id = str_field(obj, "id")?;
    if id.chars().count() > 128 {
        return Err(StorageError::invalid("campo `id` invalido"));
    }
    let external_id = obj.get("externalId").map_or(
        Err(StorageError::invalid(
            "partida sem identificador externo: sem ele nao e possivel evitar duplicatas",
        )),
        |_| str_field(obj, "externalId"),
    )?;
    let game = str_field(obj, "game")?;
    if !KNOWN_GAMES.contains(&game) {
        return Err(StorageError::invalid("jogo nao suportado"));
    }
    let origin = str_field(obj, "origin")?;
    if !KNOWN_ORIGINS.contains(&origin) {
        return Err(StorageError::invalid("origem desconhecida"));
    }
    Ok(Identity {
        id,
        game,
        origin,
        external_id,
        schema_version,
        started_at: str_field(obj, "startedAt")?,
    })
}

fn check_contracts_version(v: &str) -> StorageResult<()> {
    let parts: Vec<&str> = v.split('.').collect();
    let numeric = parts.len() == 3
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()));
    if !numeric {
        return Err(StorageError::invalid("versao dos contratos invalida"));
    }
    if parts[0].parse::<u64>().ok() != Some(SUPPORTED_CONTRACTS_MAJOR) {
        return Err(StorageError::new(
            StorageErrorCode::IncompatibleSchema,
            "versao MAJOR dos contratos nao suportada",
        ));
    }
    Ok(())
}

/// Copia do JSON com o id local trocado (reimportacao mantem o id original).
fn with_id(data: &Value, id: &str) -> Value {
    let mut copy = data.clone();
    if let Some(obj) = copy.as_object_mut() {
        obj.insert("id".into(), Value::String(id.to_string()));
    }
    copy
}

fn rounds_count(data: &Value) -> usize {
    data.get("rounds")
        .and_then(Value::as_array)
        .map_or(0, Vec::len)
}

fn read_stored(row: &Row<'_>) -> rusqlite::Result<(StoredMatch, String)> {
    let raw: String = row.get(8)?;
    Ok((
        StoredMatch {
            id: row.get(0)?,
            game: row.get(1)?,
            origin: row.get(2)?,
            external_id: row.get(3)?,
            match_schema_version: row.get::<_, i64>(4)?.max(0) as u64,
            contracts_version: row.get(5)?,
            imported_at: row.get(6)?,
            updated_at: row.get(7)?,
            data: Value::Null,
        },
        raw,
    ))
}

/// Confere o JSON lido do disco antes de entrega-lo (Zod confere o resto).
fn decode_stored((mut stored, raw): (StoredMatch, String)) -> StorageResult<StoredMatch> {
    let unreadable = || {
        StorageError::new(
            StorageErrorCode::Corrupt,
            "dados da partida ilegiveis no banco local",
        )
    };
    let data: Value = serde_json::from_str(&raw).map_err(|_| unreadable())?;
    let ident = identity(&data).map_err(|_| unreadable())?;
    if ident.id != stored.id
        || ident.external_id != stored.external_id
        || ident.origin != stored.origin
        || ident.game != stored.game
    {
        return Err(unreadable());
    }
    stored.data = data;
    Ok(stored)
}

const SELECT_STORED: &str =
    "SELECT id, game, origin, external_id, match_schema_version, contracts_version,
                                    imported_at, updated_at, data_json FROM matches";

impl Storage {
    /// Grava uma partida de forma idempotente.
    ///
    /// Identidade = (`game`, `origin`, `externalId`). Regras:
    /// - identidade nova: insere (o `id` local nao pode estar em uso);
    /// - mesma identidade e mesmo conteudo: `unchanged`, nada e escrito;
    /// - mesma identidade e conteudo diferente: atualiza mantendo o `id` local
    ///   e `imported_at`, desde que o `schemaVersion` nao regrida e nenhuma
    ///   marcacao de video aponte para um round que deixaria de existir.
    pub fn save_match(&mut self, input: &SaveMatchInput) -> StorageResult<SaveMatchResult> {
        check_contracts_version(&input.contracts_version)?;
        identity(&input.data)?;
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql("falha ao iniciar transacao"))?;
        let result = Self::save_in(&tx, input)?;
        tx.commit().map_err(sql("falha ao confirmar a gravacao"))?;
        Ok(result)
    }

    /// Grava varias partidas numa unica transacao: ou todas sao gravadas, ou
    /// nenhuma (o primeiro erro desfaz o lote inteiro). Mesmas regras de
    /// `save_match`, ate `BATCH_MAX` itens. Identidade repetida no lote e
    /// recusada, para que o resultado de cada item seja inequivoco.
    pub fn save_matches(
        &mut self,
        inputs: &[SaveMatchInput],
    ) -> StorageResult<Vec<SaveMatchResult>> {
        let at = |i: usize| {
            move |e: StorageError| {
                StorageError::new(e.code, format!("item {}: {}", i + 1, e.message))
            }
        };
        if inputs.is_empty() {
            return Err(StorageError::invalid("lote vazio"));
        }
        if inputs.len() > BATCH_MAX {
            return Err(StorageError::invalid(format!(
                "lote com mais de {BATCH_MAX} partidas"
            )));
        }
        let mut seen = HashSet::new();
        for (i, input) in inputs.iter().enumerate() {
            check_contracts_version(&input.contracts_version).map_err(at(i))?;
            let ident = identity(&input.data).map_err(at(i))?;
            if !seen.insert((ident.game, ident.origin, ident.external_id)) {
                return Err(at(i)(StorageError::invalid("partida repetida no lote")));
            }
        }
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql("falha ao iniciar transacao"))?;
        let mut results = Vec::with_capacity(inputs.len());
        for (i, input) in inputs.iter().enumerate() {
            results.push(Self::save_in(&tx, input).map_err(at(i))?);
        }
        tx.commit().map_err(sql("falha ao confirmar a gravacao"))?;
        Ok(results)
    }

    /// Regras de `save_match` dentro de uma transacao ja aberta (sem commit).
    fn save_in(tx: &Transaction<'_>, input: &SaveMatchInput) -> StorageResult<SaveMatchResult> {
        let ident = identity(&input.data)?;
        let existing: Option<(String, String, i64)> = tx
            .query_row(
                "SELECT id, data_json, match_schema_version FROM matches WHERE game = ?1 AND origin = ?2 AND external_id = ?3",
                params![ident.game, ident.origin, ident.external_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()
            .map_err(sql("falha ao consultar partidas"))?;

        let result = match existing {
            None => {
                let taken: Option<i64> = tx
                    .query_row(
                        "SELECT 1 FROM matches WHERE id = ?1",
                        params![ident.id],
                        |r| r.get(0),
                    )
                    .optional()
                    .map_err(sql("falha ao consultar partidas"))?;
                if taken.is_some() {
                    return Err(StorageError::conflict(
                        "o id local ja pertence a outra partida",
                    ));
                }
                let json = serde_json::to_string(&input.data)
                    .map_err(|_| StorageError::invalid("partida nao serializavel"))?;
                tx.execute(
                    &format!(
                        "INSERT INTO matches (id, game, origin, external_id, match_schema_version, contracts_version,
                                              started_at, data_json, imported_at, updated_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, {NOW}, {NOW})"
                    ),
                    params![
                        ident.id,
                        ident.game,
                        ident.origin,
                        ident.external_id,
                        ident.schema_version as i64,
                        input.contracts_version,
                        ident.started_at,
                        json
                    ],
                )
                .map_err(sql("falha ao gravar a partida"))?;
                SaveMatchResult {
                    id: ident.id.to_string(),
                    outcome: SaveMatchOutcome::Inserted,
                }
            }
            Some((local_id, stored_json, stored_schema)) => {
                let incoming = with_id(&input.data, &local_id);
                let stored: Option<Value> = serde_json::from_str(&stored_json).ok();
                if stored.as_ref() == Some(&incoming) {
                    SaveMatchResult {
                        id: local_id,
                        outcome: SaveMatchOutcome::Unchanged,
                    }
                } else {
                    if (ident.schema_version as i64) < stored_schema {
                        return Err(StorageError::conflict(
                            "a partida gravada usa um schemaVersion mais novo",
                        ));
                    }
                    let max_marker_round: Option<i64> = tx
                        .query_row(
                            "SELECT max(mk.round_number) FROM video_markers mk
                             JOIN video_references v ON v.id = mk.video_id WHERE v.match_id = ?1",
                            params![local_id],
                            |r| r.get(0),
                        )
                        .map_err(sql("falha ao consultar marcacoes"))?;
                    if max_marker_round.is_some_and(|n| n as usize > rounds_count(&incoming)) {
                        return Err(StorageError::conflict(
                            "a atualizacao removeria rounds usados por marcacoes de video",
                        ));
                    }
                    let json = serde_json::to_string(&incoming)
                        .map_err(|_| StorageError::invalid("partida nao serializavel"))?;
                    tx.execute(
                        &format!(
                            "UPDATE matches SET match_schema_version = ?2, contracts_version = ?3, started_at = ?4,
                                                data_json = ?5, updated_at = {NOW}
                             WHERE id = ?1"
                        ),
                        params![local_id, ident.schema_version as i64, input.contracts_version, ident.started_at, json],
                    )
                    .map_err(sql("falha ao atualizar a partida"))?;
                    SaveMatchResult {
                        id: local_id,
                        outcome: SaveMatchOutcome::Updated,
                    }
                }
            }
        };
        Ok(result)
    }

    pub fn get_match(&self, id: &str) -> StorageResult<Option<StoredMatch>> {
        let row = self
            .conn
            .query_row(
                &format!("{SELECT_STORED} WHERE id = ?1"),
                params![id],
                read_stored,
            )
            .optional()
            .map_err(sql("falha ao ler a partida"))?;
        row.map(decode_stored).transpose()
    }

    /// Partidas mais recentes primeiro. `limit` entre 1 e 500.
    pub fn list_matches(&self, limit: u32, offset: u32) -> StorageResult<Vec<MatchListItem>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, game, origin, external_id,
                        json_extract(data_json, '$.map'), json_extract(data_json, '$.mode'), started_at,
                        json_extract(data_json, '$.durationSeconds'), json_array_length(data_json, '$.rounds'),
                        imported_at, updated_at, json_extract(data_json, '$.result')
                 FROM matches ORDER BY started_at DESC, id LIMIT ?1 OFFSET ?2",
            )
            .map_err(sql("falha ao listar partidas"))?;
        let items = stmt
            .query_map(params![limit.clamp(1, LIST_MAX), offset], |r| {
                Ok(MatchListItem {
                    id: r.get(0)?,
                    game: r.get(1)?,
                    origin: r.get(2)?,
                    external_id: r.get(3)?,
                    map: r.get::<_, Option<String>>(4)?.unwrap_or_default(),
                    mode: r.get::<_, Option<String>>(5)?.unwrap_or_default(),
                    started_at: r.get(6)?,
                    duration_seconds: r.get::<_, Option<i64>>(7)?.unwrap_or(0),
                    rounds_played: r.get::<_, Option<i64>>(8)?.unwrap_or(0),
                    imported_at: r.get(9)?,
                    updated_at: r.get(10)?,
                    // JSON ilegivel vira ausente; a leitura completa (`get_match`) acusa o dano.
                    result: r
                        .get::<_, Option<String>>(11)?
                        .and_then(|raw| serde_json::from_str(&raw).ok()),
                })
            })
            .and_then(|it| it.collect::<Result<Vec<_>, _>>())
            .map_err(sql("falha ao listar partidas"))?;
        Ok(items)
    }

    pub(super) fn match_rounds(&self, id: &str) -> StorageResult<Option<i64>> {
        self.conn
            .query_row(
                "SELECT json_array_length(data_json, '$.rounds') FROM matches WHERE id = ?1",
                params![id],
                |r| r.get::<_, Option<i64>>(0),
            )
            .optional()
            .map(|o| o.map(|n| n.unwrap_or(0)))
            .map_err(sql("falha ao ler a partida"))
    }
}
