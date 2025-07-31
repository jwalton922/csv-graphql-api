import { DatabaseManager } from './database';
import { FieldMetadata } from '../schema/types';

export interface SQLFilter {
  [fieldName: string]: {
    eq?: any;
    ne?: any;
    gt?: any;
    gte?: any;
    lt?: any;
    lte?: any;
    in?: any[];
    contains?: string;
    startsWith?: string;
    endsWith?: string;
  };
}

export interface SQLPagination {
  offset?: number;
  limit?: number;
}

export class SQLQueryBuilder {
  private database: DatabaseManager;

  constructor(database: DatabaseManager) {
    this.database = database;
  }

  buildSelectQuery(
    tableName: string,
    filters?: SQLFilter,
    pagination?: SQLPagination,
    fields?: string[]
  ): { sql: string; params: any[] } {
    const safeTableName = this.database.sanitizeIdentifier(tableName);
    const params: any[] = [];
    
    // Select clause
    let sql = 'SELECT ';
    if (fields && fields.length > 0) {
      sql += fields.map(f => this.database.sanitizeIdentifier(f)).join(', ');
    } else {
      sql += '*';
    }
    sql += ` FROM ${safeTableName}`;

    // Where clause
    const whereConditions = this.buildWhereClause(filters, params);
    if (whereConditions) {
      sql += ` WHERE ${whereConditions}`;
    }

    // Order by _rowid for consistent pagination
    sql += ' ORDER BY _rowid';

    // Pagination
    if (pagination) {
      if (pagination.limit !== undefined) {
        sql += ' LIMIT ?';
        params.push(pagination.limit);
      }
      if (pagination.offset !== undefined) {
        sql += ' OFFSET ?';
        params.push(pagination.offset);
      }
    }

    return { sql, params };
  }

  buildCountQuery(
    tableName: string,
    filters?: SQLFilter
  ): { sql: string; params: any[] } {
    const safeTableName = this.database.sanitizeIdentifier(tableName);
    const params: any[] = [];
    
    let sql = `SELECT COUNT(*) as count FROM ${safeTableName}`;

    const whereConditions = this.buildWhereClause(filters, params);
    if (whereConditions) {
      sql += ` WHERE ${whereConditions}`;
    }

    return { sql, params };
  }

  private buildWhereClause(filters: SQLFilter | undefined, params: any[]): string {
    if (!filters || Object.keys(filters).length === 0) {
      return '';
    }

    const conditions: string[] = [];

    for (const [fieldName, fieldFilter] of Object.entries(filters)) {
      const safeFieldName = this.database.sanitizeIdentifier(fieldName);
      const fieldConditions = this.buildFieldConditions(safeFieldName, fieldFilter, params);
      
      if (fieldConditions.length > 0) {
        // All conditions for a field are ANDed together
        conditions.push(`(${fieldConditions.join(' AND ')})`);
      }
    }

    // All field conditions are ANDed together
    return conditions.join(' AND ');
  }

  private buildFieldConditions(
    fieldName: string,
    filter: any,
    params: any[]
  ): string[] {
    const conditions: string[] = [];

    if (filter.eq !== undefined) {
      if (filter.eq === null) {
        conditions.push(`${fieldName} IS NULL`);
      } else {
        conditions.push(`${fieldName} = ?`);
        params.push(this.convertFilterValue(filter.eq));
      }
    }

    if (filter.ne !== undefined) {
      if (filter.ne === null) {
        conditions.push(`${fieldName} IS NOT NULL`);
      } else {
        conditions.push(`${fieldName} != ?`);
        params.push(this.convertFilterValue(filter.ne));
      }
    }

    if (filter.gt !== undefined) {
      conditions.push(`${fieldName} > ?`);
      params.push(this.convertFilterValue(filter.gt));
    }

    if (filter.gte !== undefined) {
      conditions.push(`${fieldName} >= ?`);
      params.push(this.convertFilterValue(filter.gte));
    }

    if (filter.lt !== undefined) {
      conditions.push(`${fieldName} < ?`);
      params.push(this.convertFilterValue(filter.lt));
    }

    if (filter.lte !== undefined) {
      conditions.push(`${fieldName} <= ?`);
      params.push(this.convertFilterValue(filter.lte));
    }

    if (filter.in !== undefined && Array.isArray(filter.in) && filter.in.length > 0) {
      const placeholders = filter.in.map(() => '?').join(', ');
      conditions.push(`${fieldName} IN (${placeholders})`);
      filter.in.forEach((value: any) => params.push(this.convertFilterValue(value)));
    }

    if (filter.contains !== undefined) {
      conditions.push(`${fieldName} LIKE ?`);
      params.push(`%${filter.contains}%`);
    }

    if (filter.startsWith !== undefined) {
      conditions.push(`${fieldName} LIKE ?`);
      params.push(`${filter.startsWith}%`);
    }

    if (filter.endsWith !== undefined) {
      conditions.push(`${fieldName} LIKE ?`);
      params.push(`%${filter.endsWith}`);
    }

    return conditions;
  }

  private convertFilterValue(value: any): any {
    if (value === null || value === undefined) {
      return null;
    }
    
    // Handle dates
    if (value instanceof Date) {
      return value.toISOString();
    }
    
    // Handle booleans
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    
    return value;
  }

  buildRelationshipQuery(
    fromTable: string,
    fromField: string,
    toTable: string,
    toField: string,
    fromValue: any,
    isOneToMany: boolean
  ): { sql: string; params: any[] } {
    const safeFromTable = this.database.sanitizeIdentifier(fromTable);
    const safeFromField = this.database.sanitizeIdentifier(fromField);
    const safeToTable = this.database.sanitizeIdentifier(toTable);
    const safeToField = this.database.sanitizeIdentifier(toField);

    const sql = `
      SELECT * FROM ${safeToTable}
      WHERE ${safeToField} = ?
      ORDER BY _rowid
      ${isOneToMany ? '' : 'LIMIT 1'}
    `;

    return { sql: sql.trim(), params: [fromValue] };
  }
}