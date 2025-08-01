export interface CSVMetadata {
  name: string;
  path?: string;
  metadataFile?: string;
  fields: FieldMetadata[];
  relationships: Relationship[];
}

export interface FieldMetadata {
  name: string;
  type?: 'String' | 'Int' | 'Float' | 'Boolean' | 'Date' | 'DateTime';
  description?: string;
}

export interface Relationship {
  field: string;
  references: string;
  referenceField: string;
  type: 'one-to-one' | 'one-to-many';
}

export interface FilterInput {
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

export interface PaginationInput {
  offset: number;
  limit: number;
}

/**
 * Extended filter input that supports nested relationship filtering
 */
export interface NestedFilterInput {
  [fieldName: string]: FilterInput | NestedFilterInput;
}

/**
 * Query arguments that include nested filtering support
 */
export interface QueryArgs {
  filter?: NestedFilterInput;
  pagination?: PaginationInput;
}

/**
 * Configuration for relationship filtering behavior
 */
export interface RelationshipFilterConfig {
  field: string;
  relationship: Relationship;
  filter: any;
}