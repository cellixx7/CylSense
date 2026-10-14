//! Comandos Tauri da persistencia local. Superficie fechada: operacoes
//! tipadas, nenhuma execucao de SQL vinda do front-end.

use crate::storage::{
    migrations, AttachVideoInput, AttachVideoResult, MarkerInput, MatchListItem, SaveMatchInput,
    SaveMatchResult, Storage, StorageCounts, StorageError, StorageErrorCode, StorageResult,
    StoredMarker, StoredMatch, StoredVideo, UpdateMarkerInput,
};
use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

/// Banco aberto, ou o erro que impediu a abertura (o app segue funcionando).
pub struct StorageState(Mutex<StorageResult<Storage>>);

impl StorageState {
    pub fn new(storage: StorageResult<Storage>) -> Self {
        Self(Mutex::new(storage))
    }

    fn with<T>(&self, op: impl FnOnce(&mut Storage) -> StorageResult<T>) -> StorageResult<T> {
        let mut guard = self.0.lock().map_err(|_| {
            StorageError::new(
                StorageErrorCode::Unavailable,
                "armazenamento local indisponivel",
            )
        })?;
        match guard.as_mut() {
            Ok(storage) => op(storage),
            Err(e) => Err(e.clone()),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStatus {
    pub available: bool,
    /// Versao do schema SQLite (`user_version`), nao a dos contratos.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema_version: Option<u32>,
    pub supported_schema_version: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub counts: Option<StorageCounts>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<StorageError>,
}

pub fn status(state: &StorageState) -> StorageStatus {
    let supported = migrations::latest_version(migrations::MIGRATIONS);
    match state.with(|s| Ok((s.schema_version()?, s.counts()?))) {
        Ok((version, counts)) => StorageStatus {
            available: true,
            schema_version: Some(version),
            supported_schema_version: supported,
            counts: Some(counts),
            error: None,
        },
        Err(e) => StorageStatus {
            available: false,
            schema_version: None,
            supported_schema_version: supported,
            counts: None,
            error: Some(e),
        },
    }
}

#[tauri::command]
pub async fn storage_status(state: State<'_, StorageState>) -> Result<StorageStatus, ()> {
    Ok(status(&state))
}

#[tauri::command]
pub async fn match_save(
    state: State<'_, StorageState>,
    input: SaveMatchInput,
) -> StorageResult<SaveMatchResult> {
    state.with(|s| s.save_match(&input))
}

#[tauri::command]
pub async fn match_get(
    state: State<'_, StorageState>,
    id: String,
) -> StorageResult<Option<StoredMatch>> {
    state.with(|s| s.get_match(&id))
}

#[tauri::command]
pub async fn match_list(
    state: State<'_, StorageState>,
    limit: u32,
    offset: u32,
) -> StorageResult<Vec<MatchListItem>> {
    state.with(|s| s.list_matches(limit, offset))
}

#[tauri::command]
pub async fn video_attach(
    state: State<'_, StorageState>,
    input: AttachVideoInput,
) -> StorageResult<AttachVideoResult> {
    state.with(|s| s.attach_video(&input))
}

#[tauri::command]
pub async fn video_list(
    state: State<'_, StorageState>,
    match_id: String,
) -> StorageResult<Vec<StoredVideo>> {
    state.with(|s| s.list_videos(&match_id))
}

#[tauri::command]
pub async fn marker_add(
    state: State<'_, StorageState>,
    input: MarkerInput,
) -> StorageResult<StoredMarker> {
    state.with(|s| s.add_marker(&input))
}

#[tauri::command]
pub async fn marker_list(
    state: State<'_, StorageState>,
    video_id: String,
) -> StorageResult<Vec<StoredMarker>> {
    state.with(|s| s.list_markers(&video_id))
}

#[tauri::command]
pub async fn marker_update(
    state: State<'_, StorageState>,
    input: UpdateMarkerInput,
) -> StorageResult<StoredMarker> {
    state.with(|s| s.update_marker(&input))
}

#[tauri::command]
pub async fn marker_delete(state: State<'_, StorageState>, id: String) -> StorageResult<()> {
    state.with(|s| s.delete_marker(&id))
}
