//! Testes da persistencia. Cada teste usa um diretorio temporario proprio:
//! nenhum dado real do usuario e tocado.

use super::migrations::{checksum, latest_version, Migration, MIGRATIONS};
use super::*;
use rusqlite::OptionalExtension;
use serde_json::{json, Value};
use std::fs;
use tempfile::TempDir;

const CONTRACTS: &str = "1.1.0";

fn temp_db() -> (TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("data").join(DB_FILE_NAME);
    (dir, path)
}

/// Partida minima valida no formato do contrato `Match` (sintetica).
fn sample_match(id: &str, external_id: &str) -> Value {
    json!({
        "schemaVersion": 1,
        "id": id,
        "game": "valorant",
        "origin": "synthetic",
        "externalId": external_id,
        "map": "Ascent",
        "mode": "competitive",
        "startedAt": "2026-01-10T18:00:00Z",
        "durationSeconds": 1800,
        "participants": [
            { "playerRef": "p1", "displayName": "Jogador 1", "team": "red", "agent": "Jett", "kills": 1, "deaths": 0, "assists": 0 }
        ],
        "rounds": [
            { "number": 1, "winningTeam": "red" },
            { "number": 2, "winningTeam": "blue" }
        ],
        "events": []
    })
}

fn save(s: &mut Storage, data: Value) -> StorageResult<SaveMatchResult> {
    s.save_match(&SaveMatchInput {
        data,
        contracts_version: CONTRACTS.into(),
    })
}

fn video_path(name: &str) -> String {
    if cfg!(windows) {
        format!("C:\\Videos\\CYL\\{name}")
    } else {
        format!("/videos/cyl/{name}")
    }
}

fn attach(s: &mut Storage, match_id: Option<&str>, name: &str) -> StorageResult<AttachVideoResult> {
    s.attach_video(&AttachVideoInput {
        match_id: match_id.map(str::to_string),
        local_path: video_path(name),
        duration_ms: 60_000,
        offset_ms: 1_500,
    })
}

fn marker(video_id: &str, ts: i64, label: &str, round: Option<i64>) -> MarkerInput {
    MarkerInput {
        video_id: video_id.into(),
        timestamp_ms: ts,
        label: label.into(),
        description: None,
        round_number: round,
    }
}

// ---------- criacao, reabertura e configuracao ----------

#[test]
fn cria_banco_novo_com_diretorio_e_schema_atual() {
    let (_dir, path) = temp_db();
    let s = Storage::open(&path).expect("open");
    assert!(path.exists());
    assert_eq!(s.schema_version().unwrap(), latest_version(MIGRATIONS));
    assert_eq!(s.migration_report().from, 0);
    assert!(!s.migration_report().backup_created);
    assert!(s.metadata("database_created_at").unwrap().is_some());
    let fk: i64 = s
        .conn()
        .pragma_query_value(None, "foreign_keys", |r| r.get(0))
        .unwrap();
    assert_eq!(fk, 1);
    let mode: String = s
        .conn()
        .pragma_query_value(None, "journal_mode", |r| r.get(0))
        .unwrap();
    assert_eq!(mode.to_lowercase(), "wal");
}

#[test]
fn dados_persistem_apos_reabrir() {
    let (_dir, path) = temp_db();
    let video_id;
    {
        let mut s = Storage::open(&path).unwrap();
        save(&mut s, sample_match("m1", "syn-0001")).unwrap();
        video_id = attach(&mut s, Some("m1"), "a.mp4").unwrap().video.id;
        s.add_marker(&marker(&video_id, 1000, "Entrada no bomb A", Some(1)))
            .unwrap();
        s.record_app_version("0.1.0").unwrap();
    }
    let s = Storage::open(&path).unwrap();
    assert_eq!(
        s.migration_report().from,
        latest_version(MIGRATIONS),
        "nao reaplica migracoes"
    );
    let stored = s.get_match("m1").unwrap().expect("partida");
    assert_eq!(stored.data, sample_match("m1", "syn-0001"));
    assert_eq!(s.list_markers(&video_id).unwrap().len(), 1);
    assert_eq!(
        s.metadata("last_app_version").unwrap().as_deref(),
        Some("0.1.0")
    );
    let c = s.counts().unwrap();
    assert_eq!((c.matches, c.videos, c.markers), (1, 1, 1));
}

#[test]
fn checkpoint_consolida_o_wal_no_arquivo_principal() {
    let (_dir, path) = temp_db();
    let mut s = Storage::open(&path).unwrap();
    save(&mut s, sample_match("m1", "syn-0001")).unwrap();
    s.checkpoint().unwrap();
    let wal = path.with_extension("db-wal");
    assert_eq!(
        fs::metadata(&wal).map(|m| m.len()).unwrap_or(0),
        0,
        "WAL truncado"
    );
    assert!(fs::metadata(&path).unwrap().len() > 4096);
}

#[test]
fn migracoes_nao_sao_reaplicadas() {
    let (_dir, path) = temp_db();
    drop(Storage::open(&path).unwrap());
    let s = Storage::open(&path).unwrap();
    let n: i64 = s
        .conn()
        .query_row("SELECT count(*) FROM schema_migrations", [], |r| r.get(0))
        .unwrap();
    assert_eq!(n, MIGRATIONS.len() as i64);
    let sum: String = s
        .conn()
        .query_row(
            "SELECT checksum FROM schema_migrations WHERE version = 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(sum, checksum(MIGRATIONS[0].sql));
}

// ---------- migracoes ----------

const V2_OK: Migration = Migration {
    version: 2,
    name: "add_notes",
    sql: "CREATE TABLE notes (id TEXT PRIMARY KEY NOT NULL, body TEXT NOT NULL) STRICT;",
};

#[test]
fn atualiza_banco_existente_sem_perder_dados_e_faz_backup() {
    let (dir, path) = temp_db();
    {
        let mut s = Storage::open(&path).unwrap();
        save(&mut s, sample_match("m1", "syn-0001")).unwrap();
    }
    let migrations = [MIGRATIONS[0], V2_OK];
    let s = Storage::open_with(&path, &migrations).unwrap();
    assert_eq!(s.schema_version().unwrap(), 2);
    assert_eq!(
        *s.migration_report(),
        super::migrations::MigrationReport {
            from: 1,
            to: 2,
            backup_created: true
        }
    );
    assert!(s.get_match("m1").unwrap().is_some(), "dados preservados");
    let backups: Vec<_> = fs::read_dir(dir.path().join("data"))
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().contains(".pre-v1-to-v2-"))
        .collect();
    assert_eq!(backups.len(), 1);
    // O backup e um banco valido na versao anterior, com os dados.
    let backup = Storage::open(&backups[0].path()).unwrap();
    assert!(backup.get_match("m1").unwrap().is_some());
}

#[test]
fn migracao_com_falha_e_revertida_e_detectada() {
    let (_dir, path) = temp_db();
    {
        let mut s = Storage::open(&path).unwrap();
        save(&mut s, sample_match("m1", "syn-0001")).unwrap();
    }
    let broken = Migration {
        version: 2,
        name: "broken",
        sql: "CREATE TABLE half_done (id TEXT) STRICT; INSERT INTO tabela_inexistente VALUES (1);",
    };
    let e = Storage::open_with(&path, &[MIGRATIONS[0], broken])
        .err()
        .expect("deve falhar");
    assert_eq!(e.code, StorageErrorCode::MigrationFailed);
    assert!(e.message.contains("migracao 2"));

    // Nada da migracao 2 ficou gravado; o banco continua utilizavel na v1.
    let s = Storage::open(&path).unwrap();
    assert_eq!(s.schema_version().unwrap(), 1);
    let half: Option<i64> = s
        .conn()
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE name = 'half_done'",
            [],
            |r| r.get(0),
        )
        .optional()
        .unwrap();
    assert!(half.is_none(), "transacao da migracao revertida");
    assert!(s.get_match("m1").unwrap().is_some());
}

#[test]
fn banco_de_versao_mais_nova_gera_erro_compreensivel() {
    let (_dir, path) = temp_db();
    drop(Storage::open_with(&path, &[MIGRATIONS[0], V2_OK]).unwrap());
    let e = Storage::open(&path).err().expect("deve recusar");
    assert_eq!(e.code, StorageErrorCode::IncompatibleSchema);
    assert!(e.message.contains("versao mais nova"));
    assert!(e.message.contains("Atualize"));
}

#[test]
fn migracao_alterada_depois_de_aplicada_e_recusada() {
    let (_dir, path) = temp_db();
    drop(Storage::open(&path).unwrap());
    let tampered = Migration {
        version: 1,
        name: "initial_schema",
        sql: "CREATE TABLE x (id TEXT);",
    };
    let e = Storage::open_with(&path, &[tampered])
        .err()
        .expect("deve recusar");
    assert_eq!(e.code, StorageErrorCode::IncompatibleSchema);
    assert!(e.message.contains("alterada"));
}

#[test]
fn checksum_ignora_fim_de_linha() {
    assert_eq!(checksum("a\r\nb"), checksum("a\nb"));
    assert_ne!(checksum("a"), checksum("b"));
}

#[test]
fn nenhuma_migracao_e_destrutiva() {
    for m in MIGRATIONS {
        let sql = m.sql.to_uppercase();
        for forbidden in [
            "DROP TABLE",
            "DROP COLUMN",
            "DELETE FROM",
            "TRUNCATE",
            "DROP INDEX",
        ] {
            assert!(
                !sql.contains(forbidden),
                "migracao {} contem {forbidden}",
                m.version
            );
        }
    }
}

#[test]
fn lista_de_migracoes_fora_de_sequencia_e_rejeitada() {
    let (_dir, path) = temp_db();
    let e = Storage::open_with(&path, &[V2_OK])
        .err()
        .expect("deve recusar");
    assert_eq!(e.code, StorageErrorCode::MigrationFailed);
}

// ---------- banco inacessivel, corrompido e exportacao ----------

#[test]
fn banco_inacessivel_retorna_erro_sem_panico() {
    let dir = tempfile::tempdir().unwrap();
    let as_dir = dir.path().join(DB_FILE_NAME);
    fs::create_dir_all(&as_dir).unwrap();
    let e = Storage::open(&as_dir)
        .err()
        .expect("diretorio no lugar do arquivo");
    assert_eq!(e.code, StorageErrorCode::Unavailable);

    let blocker = dir.path().join("arquivo");
    fs::write(&blocker, b"x").unwrap();
    let e = Storage::open(&blocker.join("data").join(DB_FILE_NAME))
        .err()
        .expect("pai e um arquivo");
    assert_eq!(e.code, StorageErrorCode::Unavailable);
    assert!(
        !e.message.contains(&*dir.path().to_string_lossy()),
        "mensagem sem caminho"
    );
}

#[test]
fn arquivo_que_nao_e_sqlite_e_tratado_como_corrompido_e_preservado() {
    let (_dir, path) = temp_db();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let garbage = vec![0x5Au8; 8192];
    fs::write(&path, &garbage).unwrap();
    let e = Storage::open(&path).err().expect("corrompido");
    assert_eq!(e.code, StorageErrorCode::Corrupt);
    assert_eq!(
        fs::read(&path).unwrap(),
        garbage,
        "arquivo original intacto"
    );
}

#[test]
fn paginas_corrompidas_sao_detectadas_na_abertura() {
    let (_dir, path) = temp_db();
    {
        let mut s = Storage::open(&path).unwrap();
        for i in 0..50 {
            save(&mut s, sample_match(&format!("m{i}"), &format!("syn-{i}"))).unwrap();
        }
    }
    let mut bytes = fs::read(&path).unwrap();
    let page = 4096;
    assert!(bytes.len() > page * 3);
    // Estraga paginas de b-tree depois do cabecalho/sqlite_master.
    for b in &mut bytes[page..page * 3] {
        *b = 0xFF;
    }
    fs::write(&path, &bytes).unwrap();
    let e = Storage::open(&path).err().expect("corrompido");
    assert_eq!(e.code, StorageErrorCode::Corrupt);
}

#[test]
fn exporta_copia_consistente() {
    let (dir, path) = temp_db();
    let mut s = Storage::open(&path).unwrap();
    save(&mut s, sample_match("m1", "syn-0001")).unwrap();
    let dest = dir.path().join("export.db");
    s.export_copy(&dest).unwrap();
    assert_eq!(
        s.export_copy(&dest).unwrap_err().code,
        StorageErrorCode::Conflict,
        "nao sobrescreve"
    );
    let copy = Storage::open(&dest).unwrap();
    assert_eq!(
        copy.get_match("m1").unwrap().unwrap().data,
        sample_match("m1", "syn-0001")
    );
}

// ---------- partidas: idempotencia e conflitos ----------

#[test]
fn mesma_partida_importada_duas_vezes_nao_duplica() {
    let mut s = Storage::open_in_memory().unwrap();
    let first = save(&mut s, sample_match("m1", "syn-0001")).unwrap();
    assert_eq!(first.outcome, SaveMatchOutcome::Inserted);
    // O adaptador gera um id novo a cada normalizacao: a identidade e o externalId.
    let again = save(&mut s, sample_match("m-novo", "syn-0001")).unwrap();
    assert_eq!(again.outcome, SaveMatchOutcome::Unchanged);
    assert_eq!(again.id, "m1", "mantem o id local original");
    assert_eq!(s.counts().unwrap().matches, 1);
    assert!(s.get_match("m-novo").unwrap().is_none());
}

#[test]
fn partidas_distintas_sao_gravadas_separadamente() {
    let mut s = Storage::open_in_memory().unwrap();
    save(&mut s, sample_match("m1", "syn-0001")).unwrap();
    save(&mut s, sample_match("m2", "syn-0002")).unwrap();
    assert_eq!(s.list_matches(50, 0).unwrap().len(), 2);
}

#[test]
fn origens_distintas_com_mesmo_external_id_nao_se_misturam() {
    let mut s = Storage::open_in_memory().unwrap();
    save(&mut s, sample_match("m1", "abc")).unwrap();
    let mut imported = sample_match("m2", "abc");
    imported["origin"] = json!("user_import");
    assert_eq!(
        save(&mut s, imported).unwrap().outcome,
        SaveMatchOutcome::Inserted
    );
    let synthetic = s.get_match("m1").unwrap().unwrap();
    let user = s.get_match("m2").unwrap().unwrap();
    assert_eq!(
        (synthetic.origin.as_str(), user.origin.as_str()),
        ("synthetic", "user_import")
    );
}

#[test]
fn identificadores_ausentes_sao_rejeitados() {
    let mut s = Storage::open_in_memory().unwrap();
    let mut no_external = sample_match("m1", "x");
    no_external.as_object_mut().unwrap().remove("externalId");
    let e = save(&mut s, no_external).unwrap_err();
    assert_eq!(e.code, StorageErrorCode::InvalidData);
    assert!(e.message.contains("identificador externo"));

    let mut blank = sample_match("m1", "x");
    blank["externalId"] = json!("  ");
    assert_eq!(
        save(&mut s, blank).unwrap_err().code,
        StorageErrorCode::InvalidData
    );

    let mut no_id = sample_match("m1", "x");
    no_id.as_object_mut().unwrap().remove("id");
    assert_eq!(
        save(&mut s, no_id).unwrap_err().code,
        StorageErrorCode::InvalidData
    );
    assert_eq!(s.counts().unwrap().matches, 0);
}

#[test]
fn atualizacao_compativel_mantem_id_e_data_de_importacao() {
    let mut s = Storage::open_in_memory().unwrap();
    save(&mut s, sample_match("m1", "syn-0001")).unwrap();
    let before = s.get_match("m1").unwrap().unwrap();
    let mut changed = sample_match("outro-id", "syn-0001");
    changed["map"] = json!("Bind");
    let r = save(&mut s, changed).unwrap();
    assert_eq!(
        (r.id.as_str(), r.outcome),
        ("m1", SaveMatchOutcome::Updated)
    );
    let after = s.get_match("m1").unwrap().unwrap();
    assert_eq!(after.data["map"], "Bind");
    assert_eq!(after.data["id"], "m1");
    assert_eq!(after.imported_at, before.imported_at);
    assert_eq!(s.counts().unwrap().matches, 1);
}

#[test]
fn id_local_em_uso_por_outra_partida_e_conflito() {
    let mut s = Storage::open_in_memory().unwrap();
    save(&mut s, sample_match("m1", "syn-0001")).unwrap();
    let e = save(&mut s, sample_match("m1", "syn-0002")).unwrap_err();
    assert_eq!(e.code, StorageErrorCode::Conflict);
}

#[test]
fn atualizacao_que_remove_round_marcado_e_recusada() {
    let mut s = Storage::open_in_memory().unwrap();
    save(&mut s, sample_match("m1", "syn-0001")).unwrap();
    let video = attach(&mut s, Some("m1"), "a.mp4").unwrap().video;
    s.add_marker(&marker(&video.id, 10, "Round 2", Some(2)))
        .unwrap();
    let mut fewer = sample_match("m1", "syn-0001");
    fewer["rounds"] = json!([{ "number": 1, "winningTeam": "red" }]);
    let e = save(&mut s, fewer).unwrap_err();
    assert_eq!(e.code, StorageErrorCode::Conflict);
    assert_eq!(
        s.get_match("m1").unwrap().unwrap().data["rounds"]
            .as_array()
            .unwrap()
            .len(),
        2,
        "nada alterado"
    );
}

#[test]
fn versoes_nao_suportadas_sao_recusadas() {
    let mut s = Storage::open_in_memory().unwrap();
    let mut future = sample_match("m1", "syn-0001");
    future["schemaVersion"] = json!(2);
    assert_eq!(
        save(&mut s, future).unwrap_err().code,
        StorageErrorCode::IncompatibleSchema
    );
    let e = s
        .save_match(&SaveMatchInput {
            data: sample_match("m1", "x"),
            contracts_version: "2.0.0".into(),
        })
        .unwrap_err();
    assert_eq!(e.code, StorageErrorCode::IncompatibleSchema);
    let e = s
        .save_match(&SaveMatchInput {
            data: sample_match("m1", "x"),
            contracts_version: "latest".into(),
        })
        .unwrap_err();
    assert_eq!(e.code, StorageErrorCode::InvalidData);
}

#[test]
fn json_invalido_e_rejeitado() {
    let mut s = Storage::open_in_memory().unwrap();
    for bad in [
        json!(null),
        json!("texto"),
        json!([1, 2]),
        json!({ "schemaVersion": 1 }),
    ] {
        assert_eq!(
            save(&mut s, bad).unwrap_err().code,
            StorageErrorCode::InvalidData
        );
    }
    let mut unknown_origin = sample_match("m1", "x");
    unknown_origin["origin"] = json!("scraped");
    assert_eq!(
        save(&mut s, unknown_origin).unwrap_err().code,
        StorageErrorCode::InvalidData
    );
    let mut unknown_game = sample_match("m1", "x");
    unknown_game["game"] = json!("cs2");
    assert_eq!(
        save(&mut s, unknown_game).unwrap_err().code,
        StorageErrorCode::InvalidData
    );
    // Entrada do front-end com campo inesperado e recusada na desserializacao.
    let raw = json!({ "match": sample_match("m1", "x"), "contractsVersion": CONTRACTS, "sql": "DROP TABLE matches" });
    assert!(serde_json::from_value::<SaveMatchInput>(raw).is_err());
}

#[test]
fn dados_parciais_continuam_ausentes_apos_leitura() {
    let mut s = Storage::open_in_memory().unwrap();
    save(&mut s, sample_match("m1", "syn-0002")).unwrap();
    let stored = s.get_match("m1").unwrap().unwrap();
    let p = &stored.data["participants"][0];
    assert!(p.get("headshotKills").is_none(), "ausente nao vira zero");
    assert!(p.get("damageDealt").is_none());
    assert!(stored.data.get("result").is_none());
}

#[test]
fn json_adulterado_no_banco_e_detectado_na_leitura() {
    let mut s = Storage::open_in_memory().unwrap();
    save(&mut s, sample_match("m1", "syn-0001")).unwrap();
    s.conn()
        .execute(
            "UPDATE matches SET data_json = json_set(data_json, '$.id', 'outro')",
            [],
        )
        .unwrap();
    assert_eq!(
        s.get_match("m1").unwrap_err().code,
        StorageErrorCode::Corrupt
    );
    // O banco rejeita JSON sintaticamente invalido (CHECK json_valid).
    let e = s
        .conn()
        .execute("UPDATE matches SET data_json = '{quebrado'", []);
    assert!(e.is_err());
}

#[test]
fn erro_durante_transacao_nao_deixa_registro_parcial() {
    let mut s = Storage::open_in_memory().unwrap();
    s.conn()
        .execute_batch("CREATE TEMP TRIGGER falha AFTER INSERT ON matches BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;")
        .unwrap();
    let e = save(&mut s, sample_match("m1", "syn-0001")).unwrap_err();
    assert!(
        !e.message.contains("falha simulada"),
        "mensagem do SQLite nao vaza"
    );
    s.conn().execute_batch("DROP TRIGGER temp.falha;").unwrap();
    assert_eq!(s.counts().unwrap().matches, 0);
    assert_eq!(
        save(&mut s, sample_match("m1", "syn-0001"))
            .unwrap()
            .outcome,
        SaveMatchOutcome::Inserted,
        "banco segue utilizavel"
    );
}

#[test]
fn falha_de_gravacao_retorna_erro_e_app_continua() {
    let mut s = Storage::open_in_memory().unwrap();
    save(&mut s, sample_match("m1", "syn-0001")).unwrap();
    s.conn().pragma_update(None, "query_only", "ON").unwrap();
    let e = save(&mut s, sample_match("m2", "syn-0002")).unwrap_err();
    assert_eq!(e.code, StorageErrorCode::WriteFailed);
    assert!(
        s.get_match("m1").unwrap().is_some(),
        "leitura continua funcionando"
    );
    s.conn().pragma_update(None, "query_only", "OFF").unwrap();
    assert_eq!(
        save(&mut s, sample_match("m2", "syn-0002"))
            .unwrap()
            .outcome,
        SaveMatchOutcome::Inserted
    );
}

#[test]
fn listagem_ordena_por_data_e_resume() {
    let mut s = Storage::open_in_memory().unwrap();
    let mut older = sample_match("old", "syn-a");
    older["startedAt"] = json!("2026-01-01T10:00:00Z");
    save(&mut s, older).unwrap();
    save(&mut s, sample_match("new", "syn-b")).unwrap();
    let list = s.list_matches(10, 0).unwrap();
    assert_eq!(
        list.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
        ["new", "old"]
    );
    assert_eq!(
        (
            list[0].map.as_str(),
            list[0].rounds_played,
            list[0].duration_seconds
        ),
        ("Ascent", 2, 1800)
    );
    assert_eq!(s.list_matches(1, 1).unwrap()[0].id, "old");
    assert!(s.get_match("inexistente").unwrap().is_none());
}

// ---------- videos e marcacoes ----------

#[test]
fn associa_video_de_forma_idempotente() {
    let mut s = Storage::open_in_memory().unwrap();
    save(&mut s, sample_match("m1", "syn-0001")).unwrap();
    let a = attach(&mut s, Some("m1"), "partida.mp4").unwrap();
    assert!(a.created);
    assert_eq!(
        (
            a.video.file_name.as_str(),
            a.video.offset_ms,
            a.video.storage
        ),
        ("partida.mp4", 1_500, "local")
    );
    let b = attach(&mut s, Some("m1"), "partida.mp4").unwrap();
    assert!(!b.created);
    assert_eq!(a.video.id, b.video.id);
    assert_eq!(s.list_videos("m1").unwrap().len(), 1);
    // Sem partida associada tambem e permitido (contrato: matchId opcional).
    assert!(attach(&mut s, None, "solto.mp4")
        .unwrap()
        .video
        .match_id
        .is_none());
}

#[test]
fn referencias_invalidas_de_video_sao_recusadas() {
    let mut s = Storage::open_in_memory().unwrap();
    assert_eq!(
        attach(&mut s, Some("nao-existe"), "a.mp4")
            .unwrap_err()
            .code,
        StorageErrorCode::NotFound
    );
    let bad = |path: &str, duration: i64, offset: i64| AttachVideoInput {
        match_id: None,
        local_path: path.into(),
        duration_ms: duration,
        offset_ms: offset,
    };
    for input in [
        bad("relativo/a.mp4", 1000, 0),
        bad(&video_path("a.mkv"), 1000, 0),
        bad(&video_path("a.mp4"), 0, 0),
        bad(&video_path("a.mp4"), 1000, 90_000_000),
        bad("", 1000, 0),
    ] {
        assert_eq!(
            s.attach_video(&input).unwrap_err().code,
            StorageErrorCode::InvalidData
        );
    }
    assert_eq!(s.counts().unwrap().videos, 0);
    assert_eq!(
        s.list_videos("nao-existe").unwrap_err().code,
        StorageErrorCode::NotFound
    );
}

#[test]
fn integridade_referencial_e_aplicada_pelo_banco() {
    let s = Storage::open_in_memory().unwrap();
    let orphan_video = s.conn().execute(
        "INSERT INTO video_references (id, match_id, local_path, file_name, duration_ms, offset_ms, imported_at, updated_at)
         VALUES ('v', 'sem-partida', '/x.mp4', 'x.mp4', 1, 0, 'a', 'a')",
        [],
    );
    assert!(orphan_video.is_err());
    let orphan_marker = s.conn().execute(
        "INSERT INTO video_markers (id, video_id, timestamp_ms, label, source, created_at, updated_at)
         VALUES ('k', 'sem-video', 0, 'x', 'manual', 'a', 'a')",
        [],
    );
    assert!(orphan_marker.is_err());
}

#[test]
fn partida_com_video_nao_pode_ser_apagada() {
    let mut s = Storage::open_in_memory().unwrap();
    save(&mut s, sample_match("m1", "syn-0001")).unwrap();
    attach(&mut s, Some("m1"), "a.mp4").unwrap();
    assert!(
        s.conn()
            .execute("DELETE FROM matches WHERE id = 'm1'", [])
            .is_err(),
        "ON DELETE RESTRICT"
    );
}

#[test]
fn ciclo_de_vida_das_marcacoes() {
    let mut s = Storage::open_in_memory().unwrap();
    save(&mut s, sample_match("m1", "syn-0001")).unwrap();
    let video = attach(&mut s, Some("m1"), "a.mp4").unwrap().video;

    let late = s
        .add_marker(&marker(&video.id, 30_000, "  Clutch  ", Some(2)))
        .unwrap();
    assert_eq!(late.label, "Clutch", "rotulo sem espacos nas pontas");
    let early = s
        .add_marker(&MarkerInput {
            description: Some("rotacao lenta".into()),
            ..marker(&video.id, 5_000, "Rotacao", None)
        })
        .unwrap();
    let list = s.list_markers(&video.id).unwrap();
    assert_eq!(
        list.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
        [early.id.as_str(), late.id.as_str()]
    );

    let updated = s
        .update_marker(&UpdateMarkerInput {
            id: early.id.clone(),
            timestamp_ms: 6_000,
            label: "Rotacao B".into(),
            description: None,
            round_number: Some(1),
        })
        .unwrap();
    assert_eq!(
        (
            updated.timestamp_ms,
            updated.label.as_str(),
            updated.round_number
        ),
        (6_000, "Rotacao B", Some(1))
    );
    assert!(updated.description.is_none());
    assert_eq!(updated.created_at, early.created_at);

    s.delete_marker(&late.id).unwrap();
    assert_eq!(
        s.delete_marker(&late.id).unwrap_err().code,
        StorageErrorCode::NotFound
    );
    assert_eq!(s.list_markers(&video.id).unwrap().len(), 1);
}

#[test]
fn marcacoes_invalidas_sao_recusadas() {
    let mut s = Storage::open_in_memory().unwrap();
    save(&mut s, sample_match("m1", "syn-0001")).unwrap();
    let video = attach(&mut s, Some("m1"), "a.mp4").unwrap().video;
    let loose = attach(&mut s, None, "solto.mp4").unwrap().video;

    assert_eq!(
        s.add_marker(&marker("nao-existe", 0, "x", None))
            .unwrap_err()
            .code,
        StorageErrorCode::NotFound
    );
    for input in [
        marker(&video.id, -1, "x", None),
        marker(&video.id, 60_001, "apos o fim", None),
        marker(&video.id, 0, "   ", None),
        marker(&video.id, 0, &"x".repeat(81), None),
        marker(&video.id, 0, "round 3", Some(3)),
        marker(&video.id, 0, "round 0", Some(0)),
        marker(&loose.id, 0, "sem partida", Some(1)),
        MarkerInput {
            description: Some("d".repeat(1001)),
            ..marker(&video.id, 0, "x", None)
        },
    ] {
        assert_eq!(
            s.add_marker(&input).unwrap_err().code,
            StorageErrorCode::InvalidData
        );
    }
    assert_eq!(s.counts().unwrap().markers, 0);
    assert_eq!(
        s.list_markers("nao-existe").unwrap_err().code,
        StorageErrorCode::NotFound
    );
    let e = s.update_marker(&UpdateMarkerInput {
        id: "nao-existe".into(),
        timestamp_ms: 0,
        label: "x".into(),
        description: None,
        round_number: None,
    });
    assert_eq!(e.unwrap_err().code, StorageErrorCode::NotFound);
}

#[test]
fn respostas_seguem_o_formato_dos_contratos() {
    let mut s = Storage::open_in_memory().unwrap();
    save(&mut s, sample_match("m1", "syn-0001")).unwrap();
    let video = attach(&mut s, Some("m1"), "a.mp4").unwrap().video;
    let mk = s.add_marker(&marker(&video.id, 0, "x", None)).unwrap();
    let v = serde_json::to_value(&video).unwrap();
    for key in [
        "id",
        "matchId",
        "fileName",
        "durationMs",
        "offsetMs",
        "storage",
        "importedAt",
        "localPath",
    ] {
        assert!(v.get(key).is_some(), "video sem {key}");
    }
    let m = serde_json::to_value(&mk).unwrap();
    assert_eq!(m["source"], "manual");
    assert!(
        m.get("description").is_none() && m.get("roundNumber").is_none(),
        "opcional ausente, nao null"
    );
    let e = serde_json::to_value(StorageError::not_found("x")).unwrap();
    assert_eq!(e, json!({ "code": "not_found", "message": "x" }));
}

// ---------- importacao em lote (P0-04) ----------

fn batch(items: Vec<Value>) -> Vec<SaveMatchInput> {
    items
        .into_iter()
        .map(|data| SaveMatchInput {
            data,
            contracts_version: CONTRACTS.into(),
        })
        .collect()
}

#[test]
fn lote_grava_tudo_e_reimportacao_nao_duplica() {
    let (_dir, path) = temp_db();
    {
        let mut s = Storage::open(&path).unwrap();
        let r = s
            .save_matches(&batch(vec![
                sample_match("a", "syn-a"),
                sample_match("b", "syn-b"),
            ]))
            .unwrap();
        assert!(r.iter().all(|x| x.outcome == SaveMatchOutcome::Inserted));
        // Mesmo arquivo de novo, com ids locais novos (o adaptador gera outro id).
        let again = s
            .save_matches(&batch(vec![
                sample_match("a2", "syn-a"),
                sample_match("b2", "syn-b"),
            ]))
            .unwrap();
        assert_eq!(
            again
                .iter()
                .map(|x| (x.id.as_str(), x.outcome))
                .collect::<Vec<_>>(),
            [
                ("a", SaveMatchOutcome::Unchanged),
                ("b", SaveMatchOutcome::Unchanged)
            ]
        );
    }
    let s = Storage::open(&path).unwrap();
    assert_eq!(
        s.counts().unwrap().matches,
        2,
        "persistiu apos reabrir, sem duplicar"
    );
}

#[test]
fn lote_com_item_invalido_nao_grava_nada() {
    let mut s = Storage::open_in_memory().unwrap();
    let mut bad = sample_match("b", "syn-b");
    bad["schemaVersion"] = json!(2);
    let e = s
        .save_matches(&batch(vec![sample_match("a", "syn-a"), bad]))
        .unwrap_err();
    assert_eq!(e.code, StorageErrorCode::IncompatibleSchema);
    assert!(e.message.starts_with("item 2:"), "{}", e.message);
    assert_eq!(s.counts().unwrap().matches, 0);
}

#[test]
fn lote_com_conflito_no_banco_e_desfeito_por_inteiro() {
    let mut s = Storage::open_in_memory().unwrap();
    save(&mut s, sample_match("ocupado", "syn-x")).unwrap();
    // O 1o item seria inserido; o 2o usa um id local de outra partida.
    let e = s
        .save_matches(&batch(vec![
            sample_match("a", "syn-a"),
            sample_match("ocupado", "syn-b"),
        ]))
        .unwrap_err();
    assert_eq!(e.code, StorageErrorCode::Conflict);
    assert_eq!(s.counts().unwrap().matches, 1, "o item 1 foi desfeito");
    assert!(s.get_match("a").unwrap().is_none());
}

#[test]
fn lote_recusa_vazio_repetido_e_excesso() {
    let mut s = Storage::open_in_memory().unwrap();
    assert_eq!(
        s.save_matches(&[]).unwrap_err().code,
        StorageErrorCode::InvalidData
    );
    let e = s
        .save_matches(&batch(vec![
            sample_match("a", "syn-a"),
            sample_match("b", "syn-a"),
        ]))
        .unwrap_err();
    assert_eq!(e.message, "item 2: partida repetida no lote");
    let many = (0..=matches::BATCH_MAX)
        .map(|i| sample_match(&format!("m{i}"), &format!("syn-{i}")))
        .collect();
    assert_eq!(
        s.save_matches(&batch(many)).unwrap_err().code,
        StorageErrorCode::InvalidData
    );
    assert_eq!(s.counts().unwrap().matches, 0);
}

#[test]
fn lote_mesmo_externalid_de_origens_diferentes_nao_se_mistura() {
    let mut s = Storage::open_in_memory().unwrap();
    let mut user = sample_match("u", "ext-1");
    user["origin"] = json!("user_import");
    s.save_matches(&batch(vec![sample_match("s", "ext-1"), user]))
        .unwrap();
    assert_eq!(s.counts().unwrap().matches, 2);
}

#[test]
fn lote_com_falha_de_gravacao_nao_grava_nada() {
    let mut s = Storage::open_in_memory().unwrap();
    s.conn().pragma_update(None, "query_only", "ON").unwrap();
    let e = s
        .save_matches(&batch(vec![sample_match("a", "syn-a")]))
        .unwrap_err();
    assert!(
        matches!(
            e.code,
            StorageErrorCode::WriteFailed | StorageErrorCode::Unavailable
        ),
        "{e}"
    );
    s.conn().pragma_update(None, "query_only", "OFF").unwrap();
    assert_eq!(s.counts().unwrap().matches, 0);
}

#[test]
fn listagem_traz_externalid_e_resultado_quando_existe() {
    let mut s = Storage::open_in_memory().unwrap();
    let mut with_result = sample_match("r", "syn-r");
    with_result["result"] = json!({ "score": { "red": 1, "blue": 1 }, "winner": "draw" });
    save(&mut s, with_result).unwrap();
    save(&mut s, sample_match("n", "syn-n")).unwrap();
    let list = s.list_matches(10, 0).unwrap();
    let r = list.iter().find(|m| m.id == "r").unwrap();
    assert_eq!(r.external_id, "syn-r");
    assert_eq!(r.result.as_ref().unwrap()["winner"], json!("draw"));
    let n = list.iter().find(|m| m.id == "n").unwrap();
    assert!(n.result.is_none(), "sem placar continua ausente");
    let json = serde_json::to_value(n).unwrap();
    assert!(json.get("result").is_none());
    assert_eq!(json["externalId"], json!("syn-n"));
}
