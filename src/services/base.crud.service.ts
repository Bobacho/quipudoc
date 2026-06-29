import { DatabaseSync } from 'node:sqlite';

export class BaseCrudService<T extends { id: number }> {
  constructor(protected db: DatabaseSync, protected tableName: string) {}

  getAll(): T[] {
    return this.db.prepare(`SELECT * FROM ${this.tableName}`).all() as T[];
  }

  getById(id: number): T | undefined {
    return this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`).get(id) as T | undefined;
  }

  delete(id: number): void {
    this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id);
  }
}
