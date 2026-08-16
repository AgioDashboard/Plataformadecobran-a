-- Estado das travas. Uma linha so, id fixo.
CREATE TABLE IF NOT EXISTS pausa_global (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pausado INTEGER NOT NULL DEFAULT 1,
  desde TEXT NOT NULL,
  por TEXT
);

-- Comeca PAUSADO. Um sistema recem-implantado nao dispara sozinho.
INSERT OR IGNORE INTO pausa_global (id, pausado, desde, por)
VALUES (1, 1, '2026-08-15T00:00:00.000Z', 'implantacao');

CREATE TABLE IF NOT EXISTS nao_perturbe (
  telefone TEXT PRIMARY KEY,
  silenciado INTEGER NOT NULL,
  motivo TEXT,
  quando TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  direcao TEXT NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  texto TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('template', 'livre')),
  quando TEXT NOT NULL,
  id_externo TEXT,
  origem TEXT NOT NULL CHECK (origem IN ('cliente', 'ia', 'humano', 'sistema'))
);

CREATE INDEX IF NOT EXISTS idx_conversas_telefone ON conversas (telefone, quando DESC);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quando TEXT NOT NULL,
  acao TEXT NOT NULL,
  telefone TEXT,
  detalhe TEXT
);
