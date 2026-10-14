//! Migracoes versionadas do banco local.
//!
//! A versao do schema SQLite (`PRAGMA user_version`) e independente da versao
//! dos contratos Zod (`CONTRACTS_VERSION`) e do `schemaVersion` dos agregados.

use super::error::{sql, StorageError, StorageErrorCode, StorageResult};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy)]
pub struct Migration {
    pub version: u32,
    pub name: &'static str,
    pub sql: &'static str,
}

/// Lista oficial. Somente acrescentar; nunca editar ou remover uma publicada.
pub const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    name: "initial_schema",
    sql: include_str!("migrations/0001_initial_schema.sql"),
}];

/// Versao de schema que esta build sabe usar.
pub fn latest_version(migrations: &[Migration]) -> u32 {
    migrations.last().map_or(0, |m| m.version)
}

/// FNV-1a 64 do SQL (sem `\r`, para nao depender do fim de linha do checkout).
pub fn checksum(sql_text: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in sql_text.bytes().filter(|b| *b != b'\r') {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{hash:016x}")
}

pub fn user_version(conn: &Connection) -> StorageResult<u32> {
    let v: i64 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(sql("falha ao ler a versao do banco"))?;
    u32::try_from(v).map_err(|_| {
        StorageError::new(
            StorageErrorCode::IncompatibleSchema,
            "versao do banco invalida",
        )
    })
}

/// Resultado de `migrate`, util para diagnostico.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MigrationReport {
    pub from: u32,
    pub to: u32,
    /// Copia feita antes de atualizar um banco existente.
    pub backup_created: bool,
}

/// Aplica as migracoes pendentes. Cada uma roda em transacao propria
/// (`BEGIN IMMEDIATE`): em caso de falha nada daquela migracao fica gravado
/// e o banco permanece na ultima versao concluida.
pub fn migrate(
    conn: &mut Connection,
    db_path: Option<&Path>,
    migrations: &[Migration],
) -> StorageResult<MigrationReport> {
    check_sequence(migrations)?;
    let latest = latest_version(migrations);
    let current = user_version(conn)?;

    if current > latest {
        return Err(StorageError::new(
            StorageErrorCode::IncompatibleSchema,
            format!(
                "banco criado por uma versao mais nova do CYL Sense (schema {current}); esta versao suporta ate {latest}. Atualize o aplicativo."
            ),
        ));
    }
    if current > 0 {
        verify_history(conn, current, migrations)?;
    }

    let mut backup_created = false;
    if current > 0 && current < latest {
        if let Some(path) = db_path {
            backup_before_migration(conn, path, current, latest)?;
            backup_created = true;
        }
    }

    for m in migrations.iter().filter(|m| m.version > current) {
        apply(conn, m).map_err(|e| {
            StorageError::new(
                StorageErrorCode::MigrationFailed,
                format!(
                    "migracao {} ({}) falhou; banco mantido na versao {}: {}",
                    m.version,
                    m.name,
                    m.version - 1,
                    e.message
                ),
            )
        })?;
    }

    Ok(MigrationReport {
        from: current,
        to: latest,
        backup_created,
    })
}

fn check_sequence(migrations: &[Migration]) -> StorageResult<()> {
    for (i, m) in migrations.iter().enumerate() {
        if m.version as usize != i + 1 {
            return Err(StorageError::new(
                StorageErrorCode::MigrationFailed,
                "lista de migracoes fora de sequencia",
            ));
        }
    }
    Ok(())
}

fn apply(conn: &mut Connection, m: &Migration) -> StorageResult<()> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(sql("falha ao iniciar transacao"))?;
    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
           version INTEGER PRIMARY KEY NOT NULL,
           name TEXT NOT NULL,
           checksum TEXT NOT NULL,
           applied_at TEXT NOT NULL
         ) STRICT;",
    )
    .map_err(sql("falha ao preparar o historico de migracoes"))?;
    tx.execute_batch(m.sql)
        .map_err(sql("erro no SQL da migracao"))?;
    tx.execute(
        "INSERT INTO schema_migrations (version, name, checksum, applied_at)
         VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        params![m.version, m.name, checksum(m.sql)],
    )
    .map_err(sql("falha ao registrar a migracao"))?;
    tx.pragma_update(None, "user_version", m.version)
        .map_err(sql("falha ao atualizar a versao do banco"))?;
    tx.commit().map_err(sql("falha ao confirmar a migracao"))
}

/// O historico gravado precisa coincidir com as migracoes conhecidas
/// (mesma versao, nome e checksum) e com `user_version`.
fn verify_history(conn: &Connection, current: u32, migrations: &[Migration]) -> StorageResult<()> {
    let inconsistent = |detail: &str| {
        StorageError::new(
            StorageErrorCode::IncompatibleSchema,
            format!("historico de migracoes inconsistente: {detail}"),
        )
    };
    let exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(sql("falha ao ler o historico de migracoes"))?;
    if exists.is_none() {
        return Err(inconsistent("tabela ausente"));
    }

    let mut stmt = conn
        .prepare("SELECT version, name, checksum FROM schema_migrations ORDER BY version")
        .map_err(sql("falha ao ler o historico de migracoes"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(sql("falha ao ler o historico de migracoes"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql("falha ao ler o historico de migracoes"))?;

    if rows.len() != current as usize {
        return Err(inconsistent(
            "quantidade de migracoes difere da versao do banco",
        ));
    }
    for (i, (version, name, sum)) in rows.iter().enumerate() {
        let Some(known) = migrations.get(i) else {
            return Err(inconsistent("migracao desconhecida"));
        };
        if *version != i64::from(known.version) || name != known.name {
            return Err(inconsistent("migracao desconhecida"));
        }
        if *sum != checksum(known.sql) {
            return Err(inconsistent("migracao alterada depois de aplicada"));
        }
    }
    Ok(())
}

/// Copia consistente do banco (`VACUUM INTO`) ao lado do original.
fn backup_before_migration(
    conn: &Connection,
    db_path: &Path,
    from: u32,
    to: u32,
) -> StorageResult<()> {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    let file = db_path.with_extension(format!("pre-v{from}-to-v{to}-{secs}.bak"));
    let target = file.to_str().ok_or_else(|| {
        StorageError::new(StorageErrorCode::Unavailable, "caminho do backup invalido")
    })?;
    conn.execute("VACUUM INTO ?1", params![target])
        .map_err(sql("falha ao criar o backup antes da migracao"))?;
    Ok(())
}
