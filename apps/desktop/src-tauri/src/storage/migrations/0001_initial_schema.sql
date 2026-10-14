-- Migracao 1: schema inicial do banco local do CYL Sense (P0-03).
-- Somente aditiva. Nunca editar depois de publicada: o checksum e conferido
-- a cada abertura. Mudancas futuras entram como novas migracoes.

CREATE TABLE app_metadata (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
) STRICT;

INSERT INTO app_metadata (key, value)
VALUES ('database_created_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Partida normalizada (contrato Match) guardada como JSON completo.
-- Colunas extraidas apenas para identidade, ordenacao e versionamento.
CREATE TABLE matches (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
  game TEXT NOT NULL CHECK (length(game) > 0),
  origin TEXT NOT NULL CHECK (length(origin) > 0),
  external_id TEXT NOT NULL CHECK (length(external_id) > 0),
  match_schema_version INTEGER NOT NULL CHECK (match_schema_version >= 1),
  contracts_version TEXT NOT NULL CHECK (length(contracts_version) > 0),
  started_at TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- Identidade de deduplicacao: a mesma partida de origens diferentes
  -- (ex.: sintetica x Riot) nunca se mistura.
  UNIQUE (game, origin, external_id)
) STRICT;

CREATE INDEX matches_started_at ON matches (started_at DESC, id);

-- Referencia a um MP4 no disco do usuario. O video nunca e copiado para o banco.
CREATE TABLE video_references (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
  match_id TEXT REFERENCES matches (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  local_path TEXT NOT NULL CHECK (length(local_path) > 0),
  file_name TEXT NOT NULL CHECK (
    length(file_name) > 0 AND instr(file_name, '/') = 0 AND instr(file_name, '\') = 0
  ),
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
  offset_ms INTEGER NOT NULL,
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- Mesmo arquivo associado duas vezes a mesma partida = mesma referencia.
CREATE UNIQUE INDEX video_references_match_path ON video_references (match_id, local_path);

-- Marcacao manual do usuario (contrato VideoMarker).
CREATE TABLE video_markers (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
  video_id TEXT NOT NULL REFERENCES video_references (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  timestamp_ms INTEGER NOT NULL CHECK (timestamp_ms >= 0),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80 AND label = trim(label)),
  description TEXT CHECK (description IS NULL OR length(description) <= 1000),
  round_number INTEGER CHECK (round_number IS NULL OR round_number > 0),
  source TEXT NOT NULL CHECK (source = 'manual'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX video_markers_video ON video_markers (video_id, timestamp_ms);
