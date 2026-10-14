//! Referencias de video (`VideoReference`) e marcacoes manuais (`VideoMarker`).
//! O banco guarda so o caminho e metadados; o MP4 nunca e copiado.

use super::error::{sql, StorageError, StorageResult};
use super::matches::NOW;
use super::Storage;
use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::path::Path;

const MAX_PATH_CHARS: usize = 4096;
/// Deslocamento maximo aceito entre video e partida (24 h).
const MAX_OFFSET_MS: i64 = 86_400_000;
const NEW_ID: &str = "lower(hex(randomblob(16)))";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AttachVideoInput {
    pub match_id: Option<String>,
    /// Caminho absoluto do MP4 no disco do usuario (fica so no desktop).
    pub local_path: String,
    pub duration_ms: i64,
    pub offset_ms: i64,
}

/// `VideoReference` + campos locais (`localPath`, `updatedAt`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredVideo {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_id: Option<String>,
    pub file_name: String,
    pub duration_ms: i64,
    pub offset_ms: i64,
    pub storage: &'static str,
    pub imported_at: String,
    pub local_path: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachVideoResult {
    pub video: StoredVideo,
    /// `false` quando o mesmo arquivo ja estava associado a mesma partida.
    pub created: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MarkerInput {
    pub video_id: String,
    pub timestamp_ms: i64,
    pub label: String,
    pub description: Option<String>,
    pub round_number: Option<i64>,
}

/// Substitui os campos editaveis da marcacao.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateMarkerInput {
    pub id: String,
    pub timestamp_ms: i64,
    pub label: String,
    pub description: Option<String>,
    pub round_number: Option<i64>,
}

/// `VideoMarker` + `updatedAt`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredMarker {
    pub id: String,
    pub video_id: String,
    pub timestamp_ms: i64,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub round_number: Option<i64>,
    pub source: &'static str,
    pub created_at: String,
    pub updated_at: String,
}

const SELECT_VIDEO: &str =
    "SELECT id, match_id, file_name, duration_ms, offset_ms, imported_at, local_path, updated_at FROM video_references";
const SELECT_MARKER: &str =
    "SELECT id, video_id, timestamp_ms, label, description, round_number, created_at, updated_at FROM video_markers";

fn read_video(r: &Row<'_>) -> rusqlite::Result<StoredVideo> {
    Ok(StoredVideo {
        id: r.get(0)?,
        match_id: r.get(1)?,
        file_name: r.get(2)?,
        duration_ms: r.get(3)?,
        offset_ms: r.get(4)?,
        storage: "local",
        imported_at: r.get(5)?,
        local_path: r.get(6)?,
        updated_at: r.get(7)?,
    })
}

fn read_marker(r: &Row<'_>) -> rusqlite::Result<StoredMarker> {
    Ok(StoredMarker {
        id: r.get(0)?,
        video_id: r.get(1)?,
        timestamp_ms: r.get(2)?,
        label: r.get(3)?,
        description: r.get(4)?,
        round_number: r.get(5)?,
        source: "manual",
        created_at: r.get(6)?,
        updated_at: r.get(7)?,
    })
}

/// Valida o caminho e devolve o nome do arquivo. Nao exige que o arquivo
/// exista agora (pode estar em disco removivel); a leitura e do P0-07.
fn video_file_name(local_path: &str) -> StorageResult<String> {
    if local_path.is_empty()
        || local_path.chars().count() > MAX_PATH_CHARS
        || local_path.contains('\0')
    {
        return Err(StorageError::invalid("caminho do video invalido"));
    }
    let path = Path::new(local_path);
    if !path.is_absolute() {
        return Err(StorageError::invalid(
            "o caminho do video deve ser absoluto",
        ));
    }
    let is_mp4 = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("mp4"));
    if !is_mp4 {
        return Err(StorageError::invalid("somente arquivos MP4 sao aceitos"));
    }
    path.file_name()
        .and_then(|n| n.to_str())
        .filter(|n| !n.is_empty())
        .map(str::to_string)
        .ok_or_else(|| StorageError::invalid("caminho do video invalido"))
}

struct MarkerFields {
    timestamp_ms: i64,
    label: String,
    description: Option<String>,
    round_number: Option<i64>,
}

impl Storage {
    /// Associa um MP4 local a uma partida (ou a nenhuma). Idempotente por
    /// (`matchId`, caminho): repetir devolve a referencia existente.
    pub fn attach_video(&mut self, input: &AttachVideoInput) -> StorageResult<AttachVideoResult> {
        let file_name = video_file_name(&input.local_path)?;
        if input.duration_ms <= 0 {
            return Err(StorageError::invalid("duracao do video deve ser positiva"));
        }
        if input.offset_ms.abs() > MAX_OFFSET_MS {
            return Err(StorageError::invalid(
                "offset de sincronizacao fora do limite",
            ));
        }
        if let Some(match_id) = &input.match_id {
            if self.match_rounds(match_id)?.is_none() {
                return Err(StorageError::not_found("partida nao encontrada"));
            }
            let existing = self
                .conn
                .query_row(
                    &format!("{SELECT_VIDEO} WHERE match_id = ?1 AND local_path = ?2"),
                    params![match_id, input.local_path],
                    read_video,
                )
                .optional()
                .map_err(sql("falha ao consultar videos"))?;
            if let Some(video) = existing {
                return Ok(AttachVideoResult {
                    video,
                    created: false,
                });
            }
        }
        let id: String = self
            .conn
            .query_row(
                &format!(
                    "INSERT INTO video_references (id, match_id, local_path, file_name, duration_ms, offset_ms, imported_at, updated_at)
                     VALUES ({NEW_ID}, ?1, ?2, ?3, ?4, ?5, {NOW}, {NOW}) RETURNING id"
                ),
                params![input.match_id, input.local_path, file_name, input.duration_ms, input.offset_ms],
                |r| r.get(0),
            )
            .map_err(sql("falha ao gravar a referencia de video"))?;
        let video = self
            .get_video(&id)?
            .ok_or_else(|| StorageError::not_found("video nao encontrado"))?;
        Ok(AttachVideoResult {
            video,
            created: true,
        })
    }

    pub fn get_video(&self, id: &str) -> StorageResult<Option<StoredVideo>> {
        self.conn
            .query_row(
                &format!("{SELECT_VIDEO} WHERE id = ?1"),
                params![id],
                read_video,
            )
            .optional()
            .map_err(sql("falha ao ler o video"))
    }

    pub fn list_videos(&self, match_id: &str) -> StorageResult<Vec<StoredVideo>> {
        if self.match_rounds(match_id)?.is_none() {
            return Err(StorageError::not_found("partida nao encontrada"));
        }
        let mut stmt = self
            .conn
            .prepare(&format!(
                "{SELECT_VIDEO} WHERE match_id = ?1 ORDER BY imported_at, id"
            ))
            .map_err(sql("falha ao listar videos"))?;
        let rows = stmt
            .query_map(params![match_id], read_video)
            .and_then(|it| it.collect::<Result<Vec<_>, _>>())
            .map_err(sql("falha ao listar videos"))?;
        Ok(rows)
    }

    /// Mesmas regras de `checkVideoMarker` (contratos) mais a existencia do round.
    fn check_marker(
        &self,
        video_id: &str,
        timestamp_ms: i64,
        label: &str,
        description: Option<&str>,
        round: Option<i64>,
    ) -> StorageResult<MarkerFields> {
        let video = self
            .get_video(video_id)?
            .ok_or_else(|| StorageError::not_found("video nao encontrado"))?;
        if timestamp_ms < 0 {
            return Err(StorageError::invalid("instante da marcacao deve ser >= 0"));
        }
        if timestamp_ms > video.duration_ms {
            return Err(StorageError::invalid("marcacao apos o fim do video"));
        }
        let label = label.trim();
        let label_len = label.chars().count();
        if label_len == 0 || label_len > 80 {
            return Err(StorageError::invalid(
                "rotulo deve ter de 1 a 80 caracteres",
            ));
        }
        if description.is_some_and(|d| d.chars().count() > 1000) {
            return Err(StorageError::invalid(
                "observacao deve ter ate 1000 caracteres",
            ));
        }
        if let Some(n) = round {
            let Some(match_id) = &video.match_id else {
                return Err(StorageError::invalid(
                    "round informado em video sem partida associada",
                ));
            };
            let rounds = self.match_rounds(match_id)?.unwrap_or(0);
            if n < 1 || n > rounds {
                return Err(StorageError::invalid("round inexistente na partida"));
            }
        }
        Ok(MarkerFields {
            timestamp_ms,
            label: label.to_string(),
            description: description.map(str::to_string),
            round_number: round,
        })
    }

    pub fn add_marker(&mut self, input: &MarkerInput) -> StorageResult<StoredMarker> {
        let f = self.check_marker(
            &input.video_id,
            input.timestamp_ms,
            &input.label,
            input.description.as_deref(),
            input.round_number,
        )?;
        let id: String = self
            .conn
            .query_row(
                &format!(
                    "INSERT INTO video_markers (id, video_id, timestamp_ms, label, description, round_number, source, created_at, updated_at)
                     VALUES ({NEW_ID}, ?1, ?2, ?3, ?4, ?5, 'manual', {NOW}, {NOW}) RETURNING id"
                ),
                params![input.video_id, f.timestamp_ms, f.label, f.description, f.round_number],
                |r| r.get(0),
            )
            .map_err(sql("falha ao gravar a marcacao"))?;
        self.get_marker(&id)?
            .ok_or_else(|| StorageError::not_found("marcacao nao encontrada"))
    }

    pub fn get_marker(&self, id: &str) -> StorageResult<Option<StoredMarker>> {
        self.conn
            .query_row(
                &format!("{SELECT_MARKER} WHERE id = ?1"),
                params![id],
                read_marker,
            )
            .optional()
            .map_err(sql("falha ao ler a marcacao"))
    }

    pub fn list_markers(&self, video_id: &str) -> StorageResult<Vec<StoredMarker>> {
        if self.get_video(video_id)?.is_none() {
            return Err(StorageError::not_found("video nao encontrado"));
        }
        let mut stmt = self
            .conn
            .prepare(&format!(
                "{SELECT_MARKER} WHERE video_id = ?1 ORDER BY timestamp_ms, created_at, id"
            ))
            .map_err(sql("falha ao listar marcacoes"))?;
        let rows = stmt
            .query_map(params![video_id], read_marker)
            .and_then(|it| it.collect::<Result<Vec<_>, _>>())
            .map_err(sql("falha ao listar marcacoes"))?;
        Ok(rows)
    }

    pub fn update_marker(&mut self, input: &UpdateMarkerInput) -> StorageResult<StoredMarker> {
        let current = self
            .get_marker(&input.id)?
            .ok_or_else(|| StorageError::not_found("marcacao nao encontrada"))?;
        let f = self.check_marker(
            &current.video_id,
            input.timestamp_ms,
            &input.label,
            input.description.as_deref(),
            input.round_number,
        )?;
        self.conn
            .execute(
                &format!(
                    "UPDATE video_markers SET timestamp_ms = ?2, label = ?3, description = ?4, round_number = ?5, updated_at = {NOW}
                     WHERE id = ?1"
                ),
                params![input.id, f.timestamp_ms, f.label, f.description, f.round_number],
            )
            .map_err(sql("falha ao atualizar a marcacao"))?;
        self.get_marker(&input.id)?
            .ok_or_else(|| StorageError::not_found("marcacao nao encontrada"))
    }

    pub fn delete_marker(&mut self, id: &str) -> StorageResult<()> {
        let n = self
            .conn
            .execute("DELETE FROM video_markers WHERE id = ?1", params![id])
            .map_err(sql("falha ao excluir a marcacao"))?;
        if n == 0 {
            return Err(StorageError::not_found("marcacao nao encontrada"));
        }
        Ok(())
    }
}
