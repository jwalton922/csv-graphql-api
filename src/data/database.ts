import Database from 'better-sqlite3';
import * as path from 'path';
import { FieldMetadata } from '../schema/types';

export class DatabaseManager {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string = 'data/graphql-csv.db') {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  close(): void {
    this.db.close();
  }

  createTable(tableName: string, fields: FieldMetadata[]): void {
    const safeTableName = this.sanitizeIdentifier(tableName);
    
    // Drop table if exists
    this.db.exec(`DROP TABLE IF EXISTS ${safeTableName}`);

    // Create column definitions
    const columns = fields.map(field => {
      const safeFieldName = this.sanitizeIdentifier(field.name);
      const sqlType = this.getSQLType(field.type);
      return `${safeFieldName} ${sqlType}`;
    });

    // Add a rowid for pagination
    const createTableSQL = `
      CREATE TABLE ${safeTableName} (
        _rowid INTEGER PRIMARY KEY AUTOINCREMENT,
        ${columns.join(',\n        ')}
      )
    `;

    this.db.exec(createTableSQL);

    // Create indexes for better query performance
    fields.forEach(field => {
      const safeFieldName = this.sanitizeIdentifier(field.name);
      const indexName = `idx_${safeTableName}_${safeFieldName}`;
      this.db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${safeTableName}(${safeFieldName})`);
    });
  }

  insertData(tableName: string, data: any[], fields: FieldMetadata[]): void {
    if (data.length === 0) return;

    const safeTableName = this.sanitizeIdentifier(tableName);
    const fieldNames = fields.map(f => this.sanitizeIdentifier(f.name));
    const placeholders = fieldNames.map(() => '?').join(', ');

    const insertSQL = `
      INSERT INTO ${safeTableName} (${fieldNames.join(', ')})
      VALUES (${placeholders})
    `;

    const stmt = this.db.prepare(insertSQL);
    const insertMany = this.db.transaction((rows: any[]) => {
      for (const row of rows) {
        const values = fields.map(field => {
          const value = row[field.name];
          return this.convertToSQLValue(value, field.type);
        });
        stmt.run(...values);
      }
    });

    insertMany(data);
  }

  query(sql: string, params: any[] = []): any[] {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  count(tableName: string, whereClause?: string, params: any[] = []): number {
    const safeTableName = this.sanitizeIdentifier(tableName);
    let sql = `SELECT COUNT(*) as count FROM ${safeTableName}`;
    
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }

    const result = this.db.prepare(sql).get(...params) as { count: number };
    return result.count;
  }

  private getSQLType(fieldType?: string): string {
    switch (fieldType) {
      case 'Int':
        return 'INTEGER';
      case 'Float':
        return 'REAL';
      case 'Boolean':
        return 'INTEGER'; // SQLite uses 0/1 for boolean
      case 'Date':
      case 'DateTime':
        return 'TEXT'; // Store dates as ISO strings
      case 'String':
      default:
        return 'TEXT';
    }
  }

  private convertToSQLValue(value: any, fieldType?: string): any {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    switch (fieldType) {
      case 'Boolean':
        const lowerVal = String(value).toLowerCase();
        return lowerVal === 'true' || lowerVal === '1' || lowerVal === 'yes' ? 1 : 0;
      
      case 'Date':
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
      
      case 'DateTime':
        const dateTime = new Date(value);
        return isNaN(dateTime.getTime()) ? null : dateTime.toISOString();
      
      case 'Int':
        const intVal = parseInt(value, 10);
        return isNaN(intVal) ? null : intVal;
      
      case 'Float':
        const floatVal = parseFloat(value);
        return isNaN(floatVal) ? null : floatVal;
      
      default:
        return String(value);
    }
  }

  sanitizeIdentifier(identifier: string): string {
    // Remove any non-alphanumeric characters except underscores
    const sanitized = identifier.replace(/[^a-zA-Z0-9_]/g, '_');
    
    // Ensure it doesn't start with a number
    if (/^\d/.test(sanitized)) {
      return `_${sanitized}`;
    }
    
    return sanitized;
  }

  getDatabase(): Database.Database {
    return this.db;
  }
}