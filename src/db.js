const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no      TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  discipline  TEXT NOT NULL,
  type        TEXT NOT NULL,
  originator  TEXT NOT NULL,
  current_rev TEXT,
  status      TEXT NOT NULL DEFAULT 'Pending',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS revisions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id  INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  rev          TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'Pending',
  submitted_on TEXT NOT NULL,
  reviewed_on  TEXT,
  remarks      TEXT,
  UNIQUE (document_id, rev)
);

CREATE TABLE IF NOT EXISTS transmittals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  number     TEXT NOT NULL UNIQUE,
  to_party   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  purpose    TEXT NOT NULL,
  issued_on  TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transmittal_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  transmittal_id INTEGER NOT NULL REFERENCES transmittals(id) ON DELETE CASCADE,
  document_id    INTEGER NOT NULL REFERENCES documents(id),
  revision_id    INTEGER NOT NULL REFERENCES revisions(id)
);

CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_discipline ON documents(discipline);
CREATE INDEX IF NOT EXISTS idx_revisions_document ON revisions(document_id);
CREATE INDEX IF NOT EXISTS idx_items_transmittal ON transmittal_items(transmittal_id);
`;

// Opens (or creates) the database and makes sure the tables exist.
// Pass ':memory:' for a throwaway database, which is what the tests do.
function openDb(file = process.env.DB_FILE || './data/app.db') {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  if (file !== ':memory:') db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDb };
