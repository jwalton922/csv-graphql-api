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
      } else if (filter.eq instanceof Date) {
        // For Date objects, try both formats since we don't know the field type
        const dateOnly = filter.eq.toISOString().split('T')[0];
        const fullISO = filter.eq.toISOString();
        conditions.push(`(${fieldName} = ? OR ${fieldName} = ?)`);
        params.push(dateOnly, fullISO);
      } else {
        conditions.push(`${fieldName} = ?`);
        params.push(this.convertFilterValue(filter.eq));
      }
    }

    if (filter.ne !== undefined) {
      if (filter.ne === null) {
        conditions.push(`${fieldName} IS NOT NULL`);
      } else if (filter.ne instanceof Date) {
        const dateOnly = filter.ne.toISOString().split('T')[0];
        const fullISO = filter.ne.toISOString();
        conditions.push(`(${fieldName} != ? AND ${fieldName} != ?)`);
        params.push(dateOnly, fullISO);
      } else {
        conditions.push(`${fieldName} != ?`);
        params.push(this.convertFilterValue(filter.ne));
      }
    }

    if (filter.gt !== undefined) {
      if (filter.gt instanceof Date) {
        const dateOnly = filter.gt.toISOString().split('T')[0];
        const fullISO = filter.gt.toISOString();
        conditions.push(`(${fieldName} > ? OR ${fieldName} > ?)`);
        params.push(dateOnly, fullISO);
      } else {
        conditions.push(`${fieldName} > ?`);
        params.push(this.convertFilterValue(filter.gt));
      }
    }

    if (filter.gte !== undefined) {
      if (filter.gte instanceof Date) {
        const dateOnly = filter.gte.toISOString().split('T')[0];
        const fullISO = filter.gte.toISOString();
        conditions.push(`(${fieldName} >= ? OR ${fieldName} >= ?)`);
        params.push(dateOnly, fullISO);
      } else {
        conditions.push(`${fieldName} >= ?`);
        params.push(this.convertFilterValue(filter.gte));
      }
    }

    if (filter.lt !== undefined) {
      if (filter.lt instanceof Date) {
        const dateOnly = filter.lt.toISOString().split('T')[0];
        const fullISO = filter.lt.toISOString();
        conditions.push(`(${fieldName} < ? OR ${fieldName} < ?)`);
        params.push(dateOnly, fullISO);
      } else {
        conditions.push(`${fieldName} < ?`);
        params.push(this.convertFilterValue(filter.lt));
      }
    }

    if (filter.lte !== undefined) {
      if (filter.lte instanceof Date) {
        const dateOnly = filter.lte.toISOString().split('T')[0];
        const fullISO = filter.lte.toISOString();
        conditions.push(`(${fieldName} <= ? OR ${fieldName} <= ?)`);
        params.push(dateOnly, fullISO);
      } else {
        conditions.push(`${fieldName} <= ?`);
        params.push(this.convertFilterValue(filter.lte));
      }
    }

    if (filter.in !== undefined && Array.isArray(filter.in)) {
      if (filter.in.length === 0) {
        // Empty array should match nothing - add impossible condition
        conditions.push('1 = 0');
      } else {
        // Handle Date objects in array - need to support both formats
        const expandedValues: any[] = [];
        filter.in.forEach((value: any) => {
          if (value instanceof Date) {
            expandedValues.push(value.toISOString().split('T')[0]); // Date format
            expandedValues.push(value.toISOString()); // DateTime format
          } else {
            expandedValues.push(this.convertFilterValue(value));
          }
        });
        const placeholders = expandedValues.map(() => '?').join(', ');
        conditions.push(`${fieldName} IN (${placeholders})`);
        expandedValues.forEach(value => params.push(value));
      }
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
    
    // Handle dates - we need to handle both Date and DateTime formats
    if (value instanceof Date) {
      const isoString = value.toISOString();
      // For Date objects, we return both formats for comparison
      // The database query will match against stored values
      return isoString;
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