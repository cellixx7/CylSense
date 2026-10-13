use serde::Serialize;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_info])
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
}
