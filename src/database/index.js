const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'quipudoc.db');

let db;
getDb();

function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    initTables();
    migrate();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      filename       TEXT NOT NULL,
      original_name  TEXT NOT NULL,
      extracted_text TEXT,
      page_count     INTEGER,
      file_size      INTEGER,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS guides (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT,
      summary     TEXT,
      bank_area   TEXT,
      category    TEXT,
      question    TEXT NOT NULL,
      content_md  TEXT NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS guide_documents (
      guide_id    INTEGER NOT NULL,
      document_id INTEGER NOT NULL,
      PRIMARY KEY (guide_id, document_id),
      FOREIGN KEY (guide_id)    REFERENCES guides(id)    ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `);
}

function migrate() {
  const cols = ['summary', 'bank_area', 'category'];
  const existing = db.prepare("SELECT name FROM pragma_table_info('guides')").all().map(r => r.name);
  for (const col of cols) {
    if (!existing.includes(col)) {
      db.exec(`ALTER TABLE guides ADD COLUMN ${col} TEXT`);
    }
  }
}

function insertDocument({ filename, originalName, pageCount, fileSize, extractedText }) {
  const stmt = db.prepare(`
    INSERT INTO documents (filename, original_name, page_count, file_size, extracted_text)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(filename, originalName, pageCount, fileSize, extractedText).lastInsertRowid;
}

function getDocument(id) {
  const stmt = db.prepare('SELECT * FROM documents WHERE id = ?');
  return stmt.get(id);
}

function listDocuments() {
  const stmt = db.prepare('SELECT id, original_name, page_count, file_size, created_at FROM documents ORDER BY created_at DESC');
  return stmt.all();
}

function deleteDocument(id) {
  const stmt = db.prepare('DELETE FROM documents WHERE id = ?');
  return stmt.run(id);
}

function insertGuide({ title, summary, bankArea, category, question, contentMd, documentIds }) {
  const stmt = db.prepare(
    'INSERT INTO guides (title, summary, bank_area, category, question, content_md) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const guideId = stmt.run(title, summary, bankArea, category, question, contentMd).lastInsertRowid;

  const linkStmt = db.prepare('INSERT INTO guide_documents (guide_id, document_id) VALUES (?, ?)');
  for (const docId of documentIds) {
    linkStmt.run(guideId, docId);
  }

  return guideId;
}

function getGuide(id) {
  const guide = db.prepare('SELECT * FROM guides WHERE id = ?').get(id);
  if (!guide) return null;

  const docs = db.prepare(`
    SELECT d.id, d.original_name
    FROM documents d
    JOIN guide_documents gd ON gd.document_id = d.id
    WHERE gd.guide_id = ?
  `).all(id);

  guide.documents = docs;
  return guide;
}

function searchGuides({ q, bankArea, category, dateFrom, dateTo } = {}) {
  let sql = 'SELECT id, title, summary, bank_area, category, created_at FROM guides WHERE 1=1';
  const params = [];

  if (q) {
    sql += ' AND (title LIKE ? OR summary LIKE ? OR question LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (bankArea) {
    sql += ' AND bank_area = ?';
    params.push(bankArea);
  }
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (dateFrom) {
    sql += ' AND created_at >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    sql += ' AND created_at <= ?';
    params.push(dateTo + ' 23:59:59');
  }

  sql += ' ORDER BY created_at DESC';

  const guides = db.prepare(sql).all(...params);

  for (const guide of guides) {
    const docs = db.prepare(`
      SELECT d.id, d.original_name
      FROM documents d
      JOIN guide_documents gd ON gd.document_id = d.id
      WHERE gd.guide_id = ?
    `).all(guide.id);
    guide.documents = docs;
  }

  return guides;
}

function listGuides() {
  return searchGuides();
}

function deleteGuide(id) {
  const stmt = db.prepare('DELETE FROM guides WHERE id = ?');
  return stmt.run(id);
}

function getBankAreas() {
  return db.prepare("SELECT DISTINCT bank_area FROM guides WHERE bank_area IS NOT NULL AND bank_area != '' ORDER BY bank_area").all().map(r => r.bank_area);
}

function getCategories() {
  return db.prepare("SELECT DISTINCT category FROM guides WHERE category IS NOT NULL AND category != '' ORDER BY category").all().map(r => r.category);
}

module.exports = {
  getDb,
  insertDocument,
  getDocument,
  listDocuments,
  deleteDocument,
  insertGuide,
  getGuide,
  searchGuides,
  listGuides,
  deleteGuide,
  getBankAreas,
  getCategories,
};
