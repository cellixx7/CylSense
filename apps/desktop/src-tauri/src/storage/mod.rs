//! Persistencia local do desktop (SQLite via rusqlite, P0-03).
//!
//! O front-end nunca envia SQL: so chama os comandos tipados em `commands.rs`,
//! que delegam para as operacoes deste modulo.

mod error;
mod matches;
pub mod migrations;
mod videos;

pub use error::{StorageError, StorageErrorCode, StorageResult};
pub use matches::{MatchListItem, SaveMatchInput, SaveMatchOutcome, SaveMatchResult, StoredMatch};
pub use videos::{
    AttachVideoInput, AttachVideoResult, MarkerInput, StoredMarker, StoredVideo, UpdateMarkerInput,
};

use error::sql;
use migrations::{Migration, MigrationReport, MIGRATIONS};
use rusqlite::{params, Connection, OpenFlags};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Nome do arquivo dentro do diretorio de dados do app.
pub const DB_FILE_NAME: &str = "cyl-sense.db";

pub struct Storage {
    conn: Connection,
    path: Option<PathBuf>,
    migration: MigrationReport,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageCounts {
    pub matches: u64,
    pub videos: u64,
    pub markers: u64,
}

impl Storage {
    /// Abre (ou cria) o banco em `path` e aplica as migracoes pendentes.
    pub fn open(path: &Path) -> StorageResult<Self> {
        Self::open_with(path, MIGRATIONS)
    }

    pub fn open_with(path: &Path, migrations: &[Migration]) -> StorageResult<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|_| {
                StorageError::new(
                    StorageErrorCode::Unavailable,
                    "nao foi possivel criar o diretorio de dados",
                )
            })?;
        }
        if path.is_dir() {
            return Err(StorageError::new(
                StorageErrorCode::Unavailable,
                "o caminho do banco aponta para um diretorio",
            ));
        }
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        let conn = Connection::open_with_flags(path, flags)
            .map_err(sql("nao foi possivel abrir o banco local"))?;
        Self::init(conn, Some(path.to_path_buf()), migrations)
    }

    /// Banco em memoria (testes).
    #[cfg(test)]
    pub fn open_in_memory() -> StorageResult<Self> {
        let conn = Connection::open_in_memory()
            .map_err(sql("nao foi possivel abrir o banco em memoria"))?;
        Self::init(conn, None, MIGRATIONS)
    }

    fn init(
        mut conn: Connection,
        path: Option<PathBuf>,
        migrations: &[Migration],
    ) -> StorageResult<Self> {
        conn.busy_timeout(Duration::from_secs(5))
            .map_err(sql("falha ao configurar o banco"))?;
        check_integrity(&conn)?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(sql("falha ao configurar o banco"))?;
        let fk: i64 = conn
            .pragma_query_value(None, "foreign_keys", |r| r.get(0))
            .map_err(sql("falha ao configurar o banco"))?;
        if fk != 1 {
            return Err(StorageError::new(
                StorageErrorCode::Unavailable,
                "integridade referencial indisponivel",
            ));
        }
        if path.is_some() {
            // WAL: leitura nao bloqueia escrita e um crash nao corrompe o arquivo.
            // FULL: prioriza durabilidade; as escritas sao raras.
            let _: String = conn
                .pragma_update_and_check(None, "journal_mode", "WAL", |r| r.get(0))
                .map_err(sql("falha ao configurar o banco"))?;
            conn.pragma_update(None, "synchronous", "FULL")
                .map_err(sql("falha ao configurar o banco"))?;
        }
        let migration = migrations::migrate(&mut conn, path.as_deref(), migrations)?;
        Ok(Self {
            conn,
            path,
            migration,
        })
    }

    pub fn schema_version(&self) -> StorageResult<u32> {
        migrations::user_version(&self.conn)
    }

    pub fn migration_report(&self) -> &MigrationReport {
        &self.migration
    }

    pub fn path(&self) -> Option<&Path> {
        self.path.as_deref()
    }

    pub fn counts(&self) -> StorageResult<StorageCounts> {
        let count = |table: &str| -> StorageResult<u64> {
            let n: i64 = self
                .conn
                .query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))
                .map_err(sql("falha ao contar registros"))?;
            Ok(n.max(0) as u64)
        };
        Ok(StorageCounts {
            matches: count("matches")?,
            videos: count("video_references")?,
            markers: count("video_markers")?,
        })
    }

    /// Grava a versao do app que abriu o banco por ultimo (diagnostico).
    pub fn record_app_version(&self, version: &str) -> StorageResult<()> {
        self.conn
            .execute(
                "INSERT INTO app_metadata (key, value) VALUES ('last_app_version', ?1)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                params![version],
            )
            .map(|_| ())
            .map_err(sql("falha ao gravar metadados"))
    }

    pub fn metadata(&self, key: &str) -> StorageResult<Option<String>> {
        use rusqlite::OptionalExtension;
        self.conn
            .query_row(
                "SELECT value FROM app_metadata WHERE key = ?1",
                params![key],
                |r| r.get(0),
            )
            .optional()
            .map_err(sql("falha ao ler metadados"))
    }

    /// Move o conteudo do WAL para o arquivo principal (chamado ao fechar o app).
    pub fn checkpoint(&self) -> StorageResult<()> {
        self.conn
            .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))
            .map_err(sql("falha ao consolidar o banco"))
    }

    /// Exporta uma copia consistente do banco (`VACUUM INTO`). O destino nao pode existir.
    pub fn export_copy(&self, dest: &Path) -> StorageResult<()> {
        if dest.exists() {
            return Err(StorageError::conflict("o arquivo de destino ja existe"));
        }
        let target = dest
            .to_str()
            .ok_or_else(|| StorageError::invalid("caminho de destino invalido"))?;
        self.conn
            .execute("VACUUM INTO ?1", params![target])
            .map(|_| ())
            .map_err(sql("falha ao exportar o banco"))
    }

    #[cfg(test)]
    pub(crate) fn conn(&self) -> &Connection {
        &self.conn
    }
}

/// `quick_check` detecta paginas corrompidas; um arquivo que nao e SQLite
/// falha ja na primeira leitura. Nos dois casos o arquivo e preservado.
fn check_integrity(conn: &Connection) -> StorageResult<()> {
    let corrupt = || {
        StorageError::new(
            StorageErrorCode::Corrupt,
            "o banco local esta corrompido; o arquivo foi preservado sem alteracoes",
        )
    };
    let mut stmt = conn
        .prepare("PRAGMA quick_check")
        .map_err(|e| match e.sqlite_error_code() {
            Some(rusqlite::ErrorCode::DatabaseCorrupt | rusqlite::ErrorCode::NotADatabase) => {
                corrupt()
            }
            _ => StorageError::from_sqlite("falha ao verificar o banco", &e),
        })?;
    let rows: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .and_then(|it| it.collect())
        .map_err(|e| match e.sqlite_error_code() {
            Some(rusqlite::ErrorCode::DatabaseCorrupt | rusqlite::ErrorCode::NotADatabase) => {
                corrupt()
            }
            _ => StorageError::from_sqlite("falha ao verificar o banco", &e),
        })?;
    if rows.len() == 1 && rows[0] == "ok" {
        Ok(())
    } else {
        Err(corrupt())
    }
}

#[cfg(test)]
mod tests;
