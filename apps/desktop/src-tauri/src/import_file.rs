//! Leitura do arquivo escolhido pelo usuario para importacao (P0-04).
//!
//! O dialogo nativo e aberto aqui, no Rust: o front-end nunca envia um caminho
//! e so recebe o conteudo do arquivo que o usuario escolheu. Sem plugin de
//! sistema de arquivos e sem permissao JS nova. O conteudo nao e interpretado
//! aqui (a validacao e feita com Zod no front-end) e nunca vai para o log.

use serde::Serialize;
use std::fs::File;
use std::io::{ErrorKind, Read};
use std::path::Path;

/// Limite padrao (o front-end pode pedir outro ate `HARD_MAX_BYTES`).
pub const DEFAULT_MAX_BYTES: u64 = 5 * 1024 * 1024;
/// Teto absoluto, independente do que o front-end pedir.
pub const HARD_MAX_BYTES: u64 = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS: &[&str] = &["json"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportFileErrorCode {
    UnsupportedFile,
    TooLarge,
    NotFound,
    PermissionDenied,
    NotUtf8,
    ReadFailed,
}

/// Erro seguro para a UI e para o log: sem caminho e sem conteudo do arquivo.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ImportFileError {
    pub code: ImportFileErrorCode,
    pub message: String,
}

impl ImportFileError {
    fn new(code: ImportFileErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedFile {
    /// Somente o nome do arquivo, sem diretorio.
    pub name: String,
    pub size_bytes: u64,
    pub content: String,
}

fn io_error(e: &std::io::Error) -> ImportFileError {
    match e.kind() {
        ErrorKind::NotFound => {
            ImportFileError::new(ImportFileErrorCode::NotFound, "arquivo nao encontrado")
        }
        ErrorKind::PermissionDenied => ImportFileError::new(
            ImportFileErrorCode::PermissionDenied,
            "sem permissao para ler o arquivo",
        ),
        _ => ImportFileError::new(
            ImportFileErrorCode::ReadFailed,
            "nao foi possivel ler o arquivo",
        ),
    }
}

fn too_large(max_bytes: u64) -> ImportFileError {
    ImportFileError::new(
        ImportFileErrorCode::TooLarge,
        format!(
            "arquivo maior que o limite de {} KB",
            max_bytes.div_ceil(1024)
        ),
    )
}

/// Le um arquivo `.json` de no maximo `max_bytes` como texto UTF-8.
pub fn read_import_file(path: &Path, max_bytes: u64) -> Result<PickedFile, ImportFileError> {
    let max_bytes = max_bytes.clamp(1, HARD_MAX_BYTES);
    let extension_ok = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| ALLOWED_EXTENSIONS.iter().any(|a| e.eq_ignore_ascii_case(a)));
    if !extension_ok {
        return Err(ImportFileError::new(
            ImportFileErrorCode::UnsupportedFile,
            "somente arquivos .json sao aceitos",
        ));
    }
    let metadata = std::fs::metadata(path).map_err(|e| io_error(&e))?;
    if !metadata.is_file() {
        return Err(ImportFileError::new(
            ImportFileErrorCode::UnsupportedFile,
            "o item escolhido nao e um arquivo",
        ));
    }
    if metadata.len() > max_bytes {
        return Err(too_large(max_bytes));
    }

    // `take` protege contra o arquivo crescer entre a checagem e a leitura.
    let file = File::open(path).map_err(|e| io_error(&e))?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(max_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| io_error(&e))?;
    if bytes.len() as u64 > max_bytes {
        return Err(too_large(max_bytes));
    }
    let size_bytes = bytes.len() as u64;
    let mut content = String::from_utf8(bytes).map_err(|_| {
        ImportFileError::new(ImportFileErrorCode::NotUtf8, "o arquivo nao e texto UTF-8")
    })?;
    if content.starts_with('\u{feff}') {
        content.drain(..'\u{feff}'.len_utf8());
    }
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("arquivo.json")
        .to_string();
    Ok(PickedFile {
        name,
        size_bytes,
        content,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn write(dir: &Path, name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let path = dir.join(name);
        fs::write(&path, bytes).unwrap();
        path
    }

    fn assert_safe(e: &ImportFileError, dir: &Path) {
        let dir_name = dir.file_name().unwrap().to_str().unwrap();
        assert!(!e.message.contains(dir_name), "mensagem expoe o caminho");
        assert!(!e.message.contains("SEGREDO"), "mensagem expoe o conteudo");
    }

    #[test]
    fn le_json_valido_com_nome_sem_diretorio() {
        let dir = tempfile::tempdir().unwrap();
        let path = write(dir.path(), "partida.json", br#"{"format":"x"}"#);
        let file = read_import_file(&path, DEFAULT_MAX_BYTES).unwrap();
        assert_eq!(file.name, "partida.json");
        assert_eq!(file.size_bytes, 14);
        assert_eq!(file.content, r#"{"format":"x"}"#);
    }

    #[test]
    fn extensao_maiuscula_e_aceita_e_bom_e_removido() {
        let dir = tempfile::tempdir().unwrap();
        let path = write(dir.path(), "PARTIDA.JSON", "\u{feff}{}".as_bytes());
        assert_eq!(
            read_import_file(&path, DEFAULT_MAX_BYTES).unwrap().content,
            "{}"
        );
    }

    #[test]
    fn recusa_extensao_nao_suportada() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["partida.txt", "partida.json.exe", "partida"] {
            let path = write(dir.path(), name, b"SEGREDO");
            let e = read_import_file(&path, DEFAULT_MAX_BYTES).unwrap_err();
            assert_eq!(e.code, ImportFileErrorCode::UnsupportedFile, "{name}");
            assert_safe(&e, dir.path());
        }
    }

    #[test]
    fn recusa_arquivo_acima_do_limite() {
        let dir = tempfile::tempdir().unwrap();
        let path = write(dir.path(), "grande.json", &[b' '; 2048]);
        let e = read_import_file(&path, 1024).unwrap_err();
        assert_eq!(e.code, ImportFileErrorCode::TooLarge);
        assert_eq!(e.message, "arquivo maior que o limite de 1 KB");
        assert!(
            read_import_file(&path, 2048).is_ok(),
            "no limite exato passa"
        );
    }

    #[test]
    fn limite_pedido_respeita_o_teto() {
        let dir = tempfile::tempdir().unwrap();
        let path = write(dir.path(), "a.json", b"{}");
        assert!(read_import_file(&path, u64::MAX).is_ok());
        let e = read_import_file(&path, 0).unwrap_err();
        assert_eq!(
            e.code,
            ImportFileErrorCode::TooLarge,
            "limite 0 vira 1 byte"
        );
    }

    #[test]
    fn recusa_conteudo_que_nao_e_utf8() {
        let dir = tempfile::tempdir().unwrap();
        let path = write(dir.path(), "binario.json", &[0xff, 0xfe, 0x00, 0x53]);
        let e = read_import_file(&path, DEFAULT_MAX_BYTES).unwrap_err();
        assert_eq!(e.code, ImportFileErrorCode::NotUtf8);
    }

    #[test]
    fn arquivo_inexistente_e_diretorio_geram_erros_seguros() {
        let dir = tempfile::tempdir().unwrap();
        let missing =
            read_import_file(&dir.path().join("sumiu.json"), DEFAULT_MAX_BYTES).unwrap_err();
        assert_eq!(missing.code, ImportFileErrorCode::NotFound);
        assert_safe(&missing, dir.path());

        let folder = dir.path().join("pasta.json");
        fs::create_dir(&folder).unwrap();
        let e = read_import_file(&folder, DEFAULT_MAX_BYTES).unwrap_err();
        assert_eq!(e.code, ImportFileErrorCode::UnsupportedFile);
        assert_safe(&e, dir.path());
    }

    #[test]
    fn erros_de_permissao_tem_codigo_e_mensagem_proprios() {
        let e = io_error(&std::io::Error::from(ErrorKind::PermissionDenied));
        assert_eq!(e.code, ImportFileErrorCode::PermissionDenied);
        assert_eq!(e.message, "sem permissao para ler o arquivo");
        let other = io_error(&std::io::Error::other("C:\\Users\\alguem\\SEGREDO.json"));
        assert_eq!(other.code, ImportFileErrorCode::ReadFailed);
        assert!(!other.message.contains("SEGREDO"));
    }
}
