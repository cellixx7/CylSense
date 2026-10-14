use serde::Serialize;
use std::fmt;

/// Categoria do erro de armazenamento, estavel para o front-end.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StorageErrorCode {
    /// Banco nao pode ser aberto/criado (permissao, caminho invalido, em uso).
    Unavailable,
    /// Arquivo nao e um banco SQLite valido ou falhou na verificacao de integridade.
    Corrupt,
    /// Banco criado por versao mais nova do app, ou historico de migracoes divergente.
    IncompatibleSchema,
    /// Uma migracao falhou; o banco permanece na versao anterior.
    MigrationFailed,
    /// Entrada rejeitada pela validacao.
    InvalidData,
    NotFound,
    /// Conflito de identidade ou atualizacao nao permitida.
    Conflict,
    /// Falha de escrita (disco cheio, somente leitura, transacao abortada).
    WriteFailed,
}

/// Erro seguro para log e para a UI: a mensagem nunca inclui caminhos,
/// conteudo de partidas ou valores informados pelo usuario.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StorageError {
    pub code: StorageErrorCode,
    pub message: String,
}

impl StorageError {
    pub fn new(code: StorageErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(StorageErrorCode::InvalidData, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(StorageErrorCode::NotFound, message)
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(StorageErrorCode::Conflict, message)
    }

    /// Converte um erro do SQLite usando so o codigo primario (sem a mensagem
    /// original, que pode conter trechos de SQL ou valores).
    pub fn from_sqlite(context: &str, e: &rusqlite::Error) -> Self {
        use rusqlite::ErrorCode as C;
        let code = match e.sqlite_error_code() {
            Some(C::DatabaseCorrupt | C::NotADatabase) => StorageErrorCode::Corrupt,
            Some(
                C::CannotOpen
                | C::PermissionDenied
                | C::DatabaseBusy
                | C::DatabaseLocked
                | C::NoLargeFileSupport,
            ) => StorageErrorCode::Unavailable,
            Some(C::ConstraintViolation) => StorageErrorCode::Conflict,
            _ => StorageErrorCode::WriteFailed,
        };
        let reason = match e.sqlite_error_code() {
            Some(c) => format!("{c:?}"),
            None => "erro interno".to_string(),
        };
        Self::new(code, format!("{context} ({reason})"))
    }
}

impl fmt::Display for StorageError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.code, self.message)
    }
}

impl std::error::Error for StorageError {}

pub type StorageResult<T> = Result<T, StorageError>;

/// Atalho para `map_err` com contexto.
pub fn sql(context: &'static str) -> impl Fn(rusqlite::Error) -> StorageError {
    move |e| StorageError::from_sqlite(context, &e)
}
