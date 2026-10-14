use serde::Serialize;
use std::path::PathBuf;
use tauri::Manager;

mod commands;
pub mod storage;

use commands::StorageState;
use storage::{Storage, StorageError, StorageErrorCode, DB_FILE_NAME};

#[derive(Serialize)]
pub struct AppInfo {
    name: &'static str,
    version: &'static str,
}

/// Informacoes basicas do app (usado para validar a ponte front-end <-> Rust).
#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "CYL Sense",
        version: env!("CARGO_PKG_VERSION"),
    }
}

/// `<dados locais do app>/data/cyl-sense.db` (no Windows,
/// `%LOCALAPPDATA%\gg.cyl.sense\data`). Local, e nao roaming, porque guarda
/// caminhos de videos desta maquina. Em builds de debug, `CYL_SENSE_DATA_DIR`
/// isola o banco para testes manuais; em release a variavel e ignorada.
fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, StorageError> {
    if cfg!(debug_assertions) {
        if let Some(dir) = std::env::var_os("CYL_SENSE_DATA_DIR").filter(|d| !d.is_empty()) {
            eprintln!(
                "[cyl-storage] usando diretorio de dados de desenvolvimento (CYL_SENSE_DATA_DIR)"
            );
            return Ok(PathBuf::from(dir).join(DB_FILE_NAME));
        }
    }
    app.path()
        .app_local_data_dir()
        .map(|dir| dir.join("data").join(DB_FILE_NAME))
        .map_err(|_| {
            StorageError::new(
                StorageErrorCode::Unavailable,
                "diretorio de dados do aplicativo indisponivel",
            )
        })
}

/// Abre o banco sem derrubar o app: em caso de erro, o estado guarda o erro
/// e os comandos o devolvem a UI. O log nao inclui caminhos nem dados.
fn open_storage(app: &tauri::AppHandle) -> StorageState {
    let opened = database_path(app).and_then(|path| Storage::open(&path));
    match &opened {
        Ok(s) => {
            let report = s.migration_report();
            if let Err(e) = s.record_app_version(env!("CARGO_PKG_VERSION")) {
                eprintln!("[cyl-storage] aviso: {e}");
            }
            match s.counts() {
                Ok(c) => eprintln!(
                    "[cyl-storage] banco pronto: schema v{} (migrado de v{}{}), {} partidas, {} videos, {} marcacoes",
                    report.to,
                    report.from,
                    if report.backup_created { ", backup criado" } else { "" },
                    c.matches,
                    c.videos,
                    c.markers
                ),
                Err(e) => eprintln!("[cyl-storage] aviso: {e}"),
            }
        }
        Err(e) => eprintln!("[cyl-storage] banco indisponivel: {e}"),
    }
    StorageState::new(opened)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state = open_storage(app.handle());
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            commands::storage_status,
            commands::match_save,
            commands::match_get,
            commands::match_list,
            commands::video_attach,
            commands::video_list,
            commands::marker_add,
            commands::marker_list,
            commands::marker_update,
            commands::marker_delete,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o CYL Sense");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_reports_name_and_version() {
        let info = app_info();
        assert_eq!(info.name, "CYL Sense");
        assert!(!info.version.is_empty());
    }

    #[test]
    fn status_reporta_banco_indisponivel_sem_panico() {
        let state = StorageState::new(Err(StorageError::new(StorageErrorCode::Corrupt, "x")));
        let status = commands::status(&state);
        assert!(!status.available);
        assert_eq!(
            status.error.map(|e| e.code),
            Some(StorageErrorCode::Corrupt)
        );
    }

    #[test]
    fn status_reporta_versao_e_contagens() {
        let dir = tempfile::tempdir().unwrap();
        let state = StorageState::new(Storage::open(&dir.path().join(DB_FILE_NAME)));
        let status = commands::status(&state);
        assert!(status.available);
        assert_eq!(status.schema_version, Some(status.supported_schema_version));
        assert_eq!(status.counts.map(|c| c.matches), Some(0));
    }
}
