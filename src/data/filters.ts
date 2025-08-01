import { FilterInput, FieldMetadata, Relationship, CSVMetadata } from '../schema/types';
import { DatabaseManager } from './database';

export interface FieldFilter {
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
}

export interface FilterObject {
  [fieldName: string]: FieldFilter;
}

export function applyFilters<T extends Record<string, any>>(
  data: T[],
  filters: FilterObject
): T[] {
  if (!filters || Object.keys(filters).length === 0) {
    return data;
  }

  return data.filter(item => {
    // All filters must pass (AND logic)
    for (const [fieldName, fieldFilter] of Object.entries(filters)) {
      if (!fieldFilter || Object.keys(fieldFilter).length === 0) {
        continue;
      }

      const fieldValue = item[fieldName];
      
      if (!matchesFieldFilter(fieldValue, fieldFilter)) {
        return false;
      }
    }
    
    return true;
  });
}

function matchesFieldFilter(value: any, filter: FieldFilter): boolean {
  // Check each operator
  if (filter.eq !== undefined) {
    if (!isEqual(value, filter.eq)) {
      return false;
    }
  }

  if (filter.ne !== undefined) {
    if (isEqual(value, filter.ne)) {
      return false;
    }
  }

  if (filter.gt !== undefined) {
    if (!isGreaterThan(value, filter.gt)) {
      return false;
    }
  }

  if (filter.gte !== undefined) {
    if (!isGreaterThanOrEqual(value, filter.gte)) {
      return false;
    }
  }

  if (filter.lt !== undefined) {
    if (!isLessThan(value, filter.lt)) {
      return false;
    }
  }

  if (filter.lte !== undefined) {
    if (!isLessThanOrEqual(value, filter.lte)) {
      return false;
    }
  }

  if (filter.in !== undefined && Array.isArray(filter.in)) {
    if (!isInArray(value, filter.in)) {
      return false;
    }
  }

  if (filter.contains !== undefined) {
    if (!containsString(value, filter.contains)) {
      return false;
    }
  }

  if (filter.startsWith !== undefined) {
    if (!startsWithString(value, filter.startsWith)) {
      return false;
    }
  }

  if (filter.endsWith !== undefined) {
    if (!endsWithString(value, filter.endsWith)) {
      return false;
    }
  }

  return true;
}

// Helper functions for comparisons
function isEqual(value: any, compareValue: any): boolean {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return compareValue === null || compareValue === undefined;
  }

  // Handle dates
  if (value instanceof Date && compareValue instanceof Date) {
    return value.getTime() === compareValue.getTime();
  }

  // Handle date strings
  if (value instanceof Date && typeof compareValue === 'string') {
    const compareDate = new Date(compareValue);
    return !isNaN(compareDate.getTime()) && value.getTime() === compareDate.getTime();
  }

  // Standard equality
  return value === compareValue;
}

function isGreaterThan(value: any, compareValue: any): boolean {
  if (value === null || value === undefined) return false;
  
  if (value instanceof Date && compareValue instanceof Date) {
    return value.getTime() > compareValue.getTime();
  }
  
  if (value instanceof Date && typeof compareValue === 'string') {
    const compareDate = new Date(compareValue);
    return !isNaN(compareDate.getTime()) && value.getTime() > compareDate.getTime();
  }
  
  return value > compareValue;
}

function isGreaterThanOrEqual(value: any, compareValue: any): boolean {
  return isEqual(value, compareValue) || isGreaterThan(value, compareValue);
}

function isLessThan(value: any, compareValue: any): boolean {
  if (value === null || value === undefined) return false;
  
  if (value instanceof Date && compareValue instanceof Date) {
    return value.getTime() < compareValue.getTime();
  }
  
  if (value instanceof Date && typeof compareValue === 'string') {
    const compareDate = new Date(compareValue);
    return !isNaN(compareDate.getTime()) && value.getTime() < compareDate.getTime();
  }
  
  return value < compareValue;
}

function isLessThanOrEqual(value: any, compareValue: any): boolean {
  return isEqual(value, compareValue) || isLessThan(value, compareValue);
}

function isInArray(value: any, array: any[]): boolean {
  if (value === null || value === undefined) {
    return array.includes(null) || array.includes(undefined);
  }

  // Handle dates
  if (value instanceof Date) {
    return array.some(item => {
      if (item instanceof Date) {
        return value.getTime() === item.getTime();
      }
      if (typeof item === 'string') {
        const itemDate = new Date(item);
        return !isNaN(itemDate.getTime()) && value.getTime() === itemDate.getTime();
      }
      return false;
    });
  }

  return array.includes(value);
}

function containsString(value: any, searchString: string): boolean {
  if (value === null || value === undefined) return false;
  
  const stringValue = String(value);
  return stringValue.includes(searchString);
}

function startsWithString(value: any, searchString: string): boolean {
  if (value === null || value === undefined) return false;
  
  const stringValue = String(value);
  return stringValue.startsWith(searchString);
}

function endsWithString(value: any, searchString: string): boolean {
  if (value === null || value === undefined) return false;
  
  const stringValue = String(value);
  return stringValue.endsWith(searchString);
}

// Type guard to check if a value is a valid filter
export function isValidFilter(filter: any): filter is FilterObject {
  if (!filter || typeof filter !== 'object') return false;
  
  for (const fieldFilter of Object.values(filter)) {
    if (!fieldFilter || typeof fieldFilter !== 'object') return false;
    
    const validOperators = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'startsWith', 'endsWith'];
    const filterKeys = Object.keys(fieldFilter);
    
    if (!filterKeys.every(key => validOperators.includes(key))) {
      return false;
    }
  }
  
  return true;
}

/**
 * Applies nested filters to data, supporting relationship-based filtering
 * This function filters parent records based on whether ANY related record matches the criteria
 */
export function applyNestedFilters<T extends Record<string, any>>(
  data: T[],
  filters: any,
  relationships: Relationship[],
  database: DatabaseManager,
  tableName: string
): T[] {
  if (!filters || Object.keys(filters).length === 0) {
    return data;
  }

  // Cache relationship field names for performance
  const relationshipFieldMap = new Map<string, Relationship>();
  relationships.forEach(rel => {
    const fieldName = getRelationshipFieldName(rel);
    relationshipFieldMap.set(fieldName, rel);
  });

  // Separate regular filters from relationship filters for better performance
  const regularFilters: any = {};
  const relationshipFilters: Array<{ key: string; relationship: Relationship; filter: any }> = [];

  for (const [filterKey, filterValue] of Object.entries(filters)) {
    if (!filterValue || Object.keys(filterValue).length === 0) {
      continue;
    }

    const relationship = relationshipFieldMap.get(filterKey);
    if (relationship) {
      relationshipFilters.push({ key: filterKey, relationship, filter: filterValue });
    } else {
      regularFilters[filterKey] = filterValue;
    }
  }

  return data.filter(item => {
    // First apply regular field filters (faster)
    for (const [fieldName, fieldFilter] of Object.entries(regularFilters)) {
      const fieldValue = item[fieldName];
      if (!matchesFieldFilter(fieldValue, fieldFilter as FieldFilter)) {
        return false;
      }
    }

    // Then apply relationship filters (slower, involves database queries)
    for (const { relationship, filter } of relationshipFilters) {
      if (!hasMatchingRelatedRecord(item, relationship, filter, database)) {
        return false;
      }
    }
    
    return true;
  });
}

/**
 * Checks if a parent record has any related records that match the given filter
 */
function hasMatchingRelatedRecord(
  parentRecord: any,
  relationship: Relationship,
  relationshipFilter: any,
  database: DatabaseManager
): boolean {
  const parentValue = parentRecord[relationship.field];
  if (parentValue === null || parentValue === undefined) {
    return false;
  }

  try {
    // Query for related records
    const safeToTable = database.sanitizeIdentifier(relationship.references);
    const safeToField = database.sanitizeIdentifier(relationship.referenceField);
    
    const sql = `SELECT * FROM ${safeToTable} WHERE ${safeToField} = ?`;
    const relatedRecords = database.query(sql, [parentValue]);

    if (!relatedRecords || relatedRecords.length === 0) {
      return false;
    }

    // Check if ANY related record matches the filter
    return relatedRecords.some(relatedRecord => {
      // Apply the relationship filter to this related record
      for (const [fieldName, fieldFilter] of Object.entries(relationshipFilter)) {
        if (!fieldFilter || Object.keys(fieldFilter).length === 0) {
          continue;
        }

        const fieldValue = relatedRecord[fieldName];
        if (!matchesFieldFilter(fieldValue, fieldFilter)) {
          return false;
        }
      }
      return true;
    });
  } catch (error) {
    // Log error and return false to exclude this record from results
    console.error(`Error filtering relationship ${relationship.references}:`, error);
    return false;
  }
}

/**
 * Gets the GraphQL field name for a relationship
 */
function getRelationshipFieldName(relationship: Relationship): string {
  const baseName = relationship.references.charAt(0).toLowerCase() + relationship.references.slice(1);
  if (relationship.type === 'one-to-many') {
    // Don't add 's' if the name already ends with 's'
    return baseName.endsWith('s') ? baseName : baseName + 's';
  }
  return baseName;
}