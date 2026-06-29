import { DatabaseSync } from 'node:sqlite';
import os from "node:os";
import path from 'path';

const DB_PATH = path.join(os.tmpdir(), 'quipudoc.db');

interface GuideRow {
  id: number;
  title: string | null;
  summary: string | null;
  bank_area: string | null;
  category: string | null;
  question: string;
  content_md: string;
  created_at: string;
}

interface GuideListItem {
  id: number;
  title: string | null;
  summary: string | null;
  bank_area: string | null;
  category: string | null;
  created_at: string;
}

interface GuideDocRef {
  id: number;
  original_name: string;
}

interface GuideListItemWithDocs extends GuideListItem {
  documents: GuideDocRef[];
}

interface GuideDetail extends GuideRow {
  documents: GuideDocRef[];
}

interface DocumentRow {
  id: number;
  filename: string;
  original_name: string;
  extracted_text: string | null;
  page_count: number | null;
  file_size: number | null;
  created_at: string;
}

interface InsertDocumentParams {
  filename: string;
  originalName: string;
  pageCount?: number;
  fileSize?: number;
  extractedText?: string;
}

interface InsertGuideParams {
  title?: string;
  summary?: string;
  bankArea?: string;
  category?: string;
  question: string;
  contentMd: string;
  documentIds: number[];
}

interface ChatMessage {
  id: number;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface SearchParams {
  q?: string;
  bankArea?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
}

let db: DatabaseSync;

getDb();

function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    initTables();
    migrate();
  }
  return db;
}

function initTables(): void {
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role       TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content    TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function migrate(): void {
  const cols = ['summary', 'bank_area', 'category'];
  const existing = db.prepare("SELECT name FROM pragma_table_info('guides')").all() as unknown as Array<{ name: string }>;
  for (const col of cols) {
    if (!existing.some(r => r.name === col)) {
      db.exec(`ALTER TABLE guides ADD COLUMN ${col} TEXT`);
    }
  }
}

function insertDocument({ filename, originalName, pageCount, fileSize, extractedText }: InsertDocumentParams): number {
  const stmt = db.prepare(`
    INSERT INTO documents (filename, original_name, page_count, file_size, extracted_text)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(filename, originalName, pageCount ?? null, fileSize ?? null, extractedText ?? null).lastInsertRowid as unknown as number;
}

function getDocument(id: number): DocumentRow | undefined {
  const stmt = db.prepare('SELECT * FROM documents WHERE id = ?');
  return stmt.get(id) as unknown as DocumentRow | undefined;
}

function listDocuments(): Array<Omit<DocumentRow, 'filename' | 'extracted_text'>> {
  const stmt = db.prepare('SELECT id, original_name, page_count, file_size, created_at FROM documents ORDER BY created_at DESC');
  return stmt.all() as unknown as Array<Omit<DocumentRow, 'filename' | 'extracted_text'>>;
}

function deleteDocument(id: number): void {
  const stmt = db.prepare('DELETE FROM documents WHERE id = ?');
  stmt.run(id);
}

function insertGuide({ title, summary, bankArea, category, question, contentMd, documentIds }: InsertGuideParams): number {
  const stmt = db.prepare(
    'INSERT INTO guides (title, summary, bank_area, category, question, content_md) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const guideId = stmt.run(title ?? null, summary ?? null, bankArea ?? null, category ?? null, question, contentMd).lastInsertRowid as unknown as number;

  const linkStmt = db.prepare('INSERT INTO guide_documents (guide_id, document_id) VALUES (?, ?)');
  for (const docId of documentIds) {
    linkStmt.run(guideId, docId);
  }

  return guideId;
}

function getGuide(id: number): GuideDetail | null {
  const guide = db.prepare('SELECT * FROM guides WHERE id = ?').get(id) as unknown as GuideRow | undefined;
  if (!guide) return null;

  const docs = db.prepare(`
    SELECT d.id, d.original_name
    FROM documents d
    JOIN guide_documents gd ON gd.document_id = d.id
    WHERE gd.guide_id = ?
  `).all(id) as unknown as GuideDocRef[];

  return { ...guide, documents: docs };
}

function searchGuides(params: SearchParams = {}): GuideListItemWithDocs[] {
  const { q, bankArea, category, dateFrom, dateTo } = params;
  let sql = 'SELECT id, title, summary, bank_area, category, created_at FROM guides WHERE 1=1';
  const sqlParams: unknown[] = [];

  if (q) {
    sql += ' AND (title LIKE ? OR summary LIKE ? OR question LIKE ?)';
    const like = `%${q}%`;
    sqlParams.push(like, like, like);
  }
  if (bankArea) {
    sql += ' AND bank_area = ?';
    sqlParams.push(bankArea);
  }
  if (category) {
    sql += ' AND category = ?';
    sqlParams.push(category);
  }
  if (dateFrom) {
    sql += ' AND created_at >= ?';
    sqlParams.push(dateFrom);
  }
  if (dateTo) {
    sql += ' AND created_at <= ?';
    sqlParams.push(dateTo + ' 23:59:59');
  }

  sql += ' ORDER BY created_at DESC';

  const guides = db.prepare(sql).all(...sqlParams as string[]) as unknown as GuideListItem[];

  const docStmt = db.prepare(`
    SELECT d.id, d.original_name
    FROM documents d
    JOIN guide_documents gd ON gd.document_id = d.id
    WHERE gd.guide_id = ?
  `);

  return guides.map(guide => ({
    ...guide,
    documents: docStmt.all(guide.id) as unknown as GuideDocRef[],
  }));
}

function listGuides(): GuideListItemWithDocs[] {
  return searchGuides();
}

function deleteGuide(id: number): void {
  const stmt = db.prepare('DELETE FROM guides WHERE id = ?');
  stmt.run(id);
}

function insertChatMessage(sessionId: string, role: 'user' | 'assistant', content: string): number {
  const stmt = db.prepare('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)');
  return stmt.run(sessionId, role, content).lastInsertRowid as unknown as number;
}

function getChatMessages(sessionId: string, limit = 20): ChatMessage[] {
  const stmt = db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?');
  return stmt.all(sessionId, limit) as unknown as ChatMessage[];
}

function searchGuidesContext(query: string, limit = 5): Array<{ title: string; summary: string }> {
  const cols = ['title', 'summary', 'question'];
  let sql = "SELECT id, title, summary FROM guides WHERE 1=0";
  const params: string[] = [];

  for (const col of cols) {
    sql += ` OR ${col} LIKE ?`;
    params.push(`%${query}%`);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(String(limit));

  return db.prepare(sql).all(...params) as unknown as Array<{ title: string; summary: string }>;
}

function getBankAreas(): string[] {
  return (db.prepare("SELECT DISTINCT bank_area FROM guides WHERE bank_area IS NOT NULL AND bank_area != '' ORDER BY bank_area").all() as unknown as Array<{ bank_area: string }>).map(r => r.bank_area);
}

function getCategories(): string[] {
  return (db.prepare("SELECT DISTINCT category FROM guides WHERE category IS NOT NULL AND category != '' ORDER BY category").all() as unknown as Array<{ category: string }>).map(r => r.category);
}

export {
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
  insertChatMessage,
  getChatMessages,
  searchGuidesContext,
};
