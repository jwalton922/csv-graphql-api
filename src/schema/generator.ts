import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLList,
  GraphQLNonNull,
  GraphQLInputObjectType,
  GraphQLFieldConfig,
  GraphQLInputFieldConfig,
  GraphQLScalarType,
} from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { CSVLoader } from '../data/loader';
import { DatabaseManager } from '../data/database';
import { SQLQueryBuilder } from '../data/sql-builder';
import { CSVMetadata, FilterInput, PaginationInput, FieldMetadata, Relationship } from './types';
import { DateScalar, DateTimeScalar } from './scalars';
import { applyFilters, applyNestedFilters } from '../data/filters';

export class SchemaGenerator {
  private csvLoader: CSVLoader;
  private metadata: CSVMetadata[];
  private database: DatabaseManager;
  private queryBuilder: SQLQueryBuilder;
  private types: Map<string, GraphQLObjectType>;
  private filterTypes: Map<string, GraphQLInputObjectType>;
  private resultTypes: Map<string, GraphQLObjectType>;
  private schemas: Map<string, FieldMetadata[]>;

  constructor(csvLoader: CSVLoader, metadata: CSVMetadata[], database: DatabaseManager) {
    this.csvLoader = csvLoader;
    this.metadata = metadata;
    this.database = database;
    this.queryBuilder = new SQLQueryBuilder(database);
    this.types = new Map();
    this.filterTypes = new Map();
    this.resultTypes = new Map();
    this.schemas = new Map();
  }

  async generateSchema(): Promise<GraphQLSchema> {
    // Load all CSV data into SQLite
    for (const csvMeta of this.metadata) {
      await this.csvLoader.loadCSVIntoDatabase(csvMeta);
    }

    // First pass: create basic types without relationships
    for (const csvMeta of this.metadata) {
      await this.createBasicType(csvMeta);
    }

    // Second pass: add relationship fields
    for (const csvMeta of this.metadata) {
      if (csvMeta.relationships && csvMeta.relationships.length > 0) {
        this.addRelationshipFields(csvMeta);
      }
    }

    // Create filter and result types
    for (const csvMeta of this.metadata) {
      this.createFilterType(csvMeta);
      this.createResultType(csvMeta);
    }

    // Create root query
    const queryFields: { [key: string]: GraphQLFieldConfig<any, any> } = {};
    
    for (const csvMeta of this.metadata) {
      const queryName = this.getQueryName(csvMeta.name);
      queryFields[queryName] = this.createQueryField(csvMeta);
    }

    const queryType = new GraphQLObjectType({
      name: 'Query',
      fields: queryFields,
    });

    return new GraphQLSchema({
      query: queryType,
      types: [DateScalar, DateTimeScalar],
    });
  }

  private async createBasicType(csvMeta: CSVMetadata): Promise<void> {
    // Get schema from first row of data
    const { sql, params } = this.queryBuilder.buildSelectQuery(csvMeta.name, undefined, { limit: 1 });
    const sampleData = this.database.query(sql, params);
    
    const schema = this.csvLoader.inferSchema(sampleData, csvMeta.fields);
    this.schemas.set(csvMeta.name, schema);

    // Create GraphQL type with fields function for lazy evaluation
    const type = new GraphQLObjectType({
      name: csvMeta.name,
      fields: () => {
        const fields: { [key: string]: GraphQLFieldConfig<any, any> } = {};

        // Add regular fields
        for (const field of schema) {
          // Skip internal _rowid field
          if (field.name === '_rowid') continue;
          
          fields[field.name] = {
            type: this.getGraphQLType(field.type),
            description: field.description,
          };
        }

        // Add relationship fields
        for (const relationship of csvMeta.relationships) {
          const relatedType = this.types.get(relationship.references);
          if (!relatedType) continue;

          const fieldName = this.getRelationshipFieldName(relationship);
          const relatedFilterType = this.filterTypes.get(relationship.references);
          
          fields[fieldName] = {
            type: relationship.type === 'one-to-many' 
              ? new GraphQLList(relatedType)
              : relatedType,
            args: {
              ...(relatedFilterType ? { filter: { type: relatedFilterType } } : {}),
              ...(relationship.type === 'one-to-many' ? {
                pagination: {
                  type: new GraphQLInputObjectType({
                    name: `${csvMeta.name}${this.capitalize(fieldName)}Pagination`,
                    fields: {
                      offset: { type: GraphQLInt },
                      limit: { type: GraphQLInt },
                    },
                  }),
                  defaultValue: { offset: 0, limit: 100 },
                }
              } : {})
            },
            resolve: (parent: any, args: any) => {
              return this.resolveRelationship(
                parent, 
                relationship, 
                args.filter, 
                args.pagination
              );
            },
          };
        }

        return fields;
      },
    });

    this.types.set(csvMeta.name, type);
  }

  private addRelationshipFields(csvMeta: CSVMetadata): void {
    // This method is no longer needed since relationships are handled in createBasicType
    // Keep for backward compatibility but make it empty
  }

  private createFilterType(csvMeta: CSVMetadata): void {
    const schema = this.schemas.get(csvMeta.name);
    if (!schema) return;

    const filterType = new GraphQLInputObjectType({
      name: `${csvMeta.name}Filter`,
      fields: () => {
        const filterFields: { [key: string]: GraphQLInputFieldConfig } = {};

        // Add regular field filters
        for (const field of schema) {
          // Skip internal _rowid field
          if (field.name === '_rowid') continue;
          
          const fieldFilterType = new GraphQLInputObjectType({
            name: `${csvMeta.name}${this.capitalize(field.name)}Filter`,
            fields: {
              eq: { type: this.getGraphQLType(field.type) },
              ne: { type: this.getGraphQLType(field.type) },
              gt: { type: this.getGraphQLType(field.type) },
              gte: { type: this.getGraphQLType(field.type) },
              lt: { type: this.getGraphQLType(field.type) },
              lte: { type: this.getGraphQLType(field.type) },
              in: { type: new GraphQLList(this.getGraphQLType(field.type)) },
              contains: { type: GraphQLString },
              startsWith: { type: GraphQLString },
              endsWith: { type: GraphQLString },
            },
          });

          filterFields[field.name] = { type: fieldFilterType };
        }

        // Add relationship filters using lazy evaluation
        for (const relationship of csvMeta.relationships) {
          const relationshipFieldName = this.getRelationshipFieldName(relationship);
          const relatedFilterType = this.filterTypes.get(relationship.references);
          
          if (relatedFilterType) {
            filterFields[relationshipFieldName] = { type: relatedFilterType };
          }
        }

        return filterFields;
      },
    });

    this.filterTypes.set(csvMeta.name, filterType);
  }

  private createResultType(csvMeta: CSVMetadata): void {
    const type = this.types.get(csvMeta.name);
    if (!type) return;

    const resultType = new GraphQLObjectType({
      name: `${csvMeta.name}Result`,
      fields: {
        items: { type: new GraphQLNonNull(new GraphQLList(type)) },
        totalCount: { type: new GraphQLNonNull(GraphQLInt) },
        offset: { type: new GraphQLNonNull(GraphQLInt) },
        limit: { type: new GraphQLNonNull(GraphQLInt) },
      },
    });

    this.resultTypes.set(csvMeta.name, resultType);
  }

  private createQueryField(csvMeta: CSVMetadata): GraphQLFieldConfig<any, any> {
    const resultType = this.resultTypes.get(csvMeta.name);
    const filterType = this.filterTypes.get(csvMeta.name);

    if (!resultType) {
      throw new Error(`Result type not found for ${csvMeta.name}`);
    }

    const args: any = {
      pagination: {
        type: new GraphQLInputObjectType({
          name: `${csvMeta.name}Pagination`,
          fields: {
            offset: { type: GraphQLInt },
            limit: { type: GraphQLInt },
          },
        }),
        defaultValue: { offset: 0, limit: 100 },
      },
    };

    if (filterType) {
      args.filter = { type: filterType };
    }

    return {
      type: resultType,
      args,
      resolve: async (_: any, args: any) => {
        const schema = this.schemas.get(csvMeta.name);
        if (!schema) {
          return { items: [], totalCount: 0, offset: 0, limit: 100 };
        }

        const offset = args.pagination?.offset || 0;
        const limit = Math.min(args.pagination?.limit || 100, 1000); // Max 1000 items

        // Check if we have relationship filters that require nested filtering
        const hasRelationshipFilters = this.hasRelationshipFilters(args.filter, csvMeta.relationships);
        
        let items: any[];
        let totalCount: number;
        
        if (hasRelationshipFilters) {
          // Use nested filtering approach - get all data first, then filter in memory
          const allDataQuery = this.queryBuilder.buildSelectQuery(csvMeta.name);
          const allData = this.database.query(allDataQuery.sql, allDataQuery.params);
          
          // Apply nested filters
          const filteredData = applyNestedFilters(
            allData,
            args.filter,
            csvMeta.relationships,
            this.database,
            csvMeta.name
          );
          
          totalCount = filteredData.length;
          
          // Apply pagination after filtering
          items = filteredData.slice(offset, offset + limit);
        } else {
          // Use SQL-based filtering for regular field filters
          const countQuery = this.queryBuilder.buildCountQuery(csvMeta.name, args.filter);
          const countResult = this.database.query(countQuery.sql, countQuery.params)[0] as { count: number };
          totalCount = countResult.count;

          const selectQuery = this.queryBuilder.buildSelectQuery(
            csvMeta.name,
            args.filter,
            { offset, limit }
          );
          items = this.database.query(selectQuery.sql, selectQuery.params);
        }

        // Remove _rowid from results
        const cleanedItems = items.map(item => {
          const { _rowid, ...rest } = item;
          return rest;
        });

        return {
          items: cleanedItems,
          totalCount,
          offset,
          limit,
        };
      },
    };
  }


  private async resolveRelationship(
    parent: any, 
    relationship: Relationship, 
    filter?: any, 
    pagination?: { offset?: number; limit?: number }
  ): Promise<any> {
    const parentValue = parent[relationship.field];
    if (parentValue === null || parentValue === undefined) return null;

    // For one-to-one relationships, we don't need pagination
    if (relationship.type === 'one-to-one') {
      const { sql, params } = this.queryBuilder.buildRelationshipQuery(
        '', // from table not needed
        relationship.field,
        relationship.references,
        relationship.referenceField,
        parentValue,
        false, // isOneToMany = false
        filter, // Apply filter in SQL
        undefined // No pagination for one-to-one
      );

      const results = this.database.query(sql, params);

      // Remove _rowid from results
      const cleanedResults = results.map(item => {
        const { _rowid, ...rest } = item;
        return rest;
      });

      return cleanedResults[0] || null;
    }

    // For one-to-many relationships, handle filtering and pagination
    const offset = Math.max(pagination?.offset ?? 0, 0); // Ensure offset is not negative
    const limit = pagination?.limit !== undefined 
      ? Math.min(Math.max(pagination.limit, 0), 1000) // Use provided limit (can be 0), max 1000
      : 100; // Default to 100 if not provided
    
    // If limit is 0, return empty array immediately
    if (limit === 0) {
      return [];
    }

    const { sql, params } = this.queryBuilder.buildRelationshipQuery(
      '', // from table not needed
      relationship.field,
      relationship.references,
      relationship.referenceField,
      parentValue,
      true, // isOneToMany = true
      filter,
      { offset, limit }
    );

    const results = this.database.query(sql, params);

    // Remove _rowid from results
    const cleanedResults = results.map(item => {
      const { _rowid, ...rest } = item;
      return rest;
    });

    return cleanedResults;
  }

  private getGraphQLType(fieldType?: string): GraphQLScalarType {
    switch (fieldType) {
      case 'Int':
        return GraphQLInt;
      case 'Float':
        return GraphQLFloat;
      case 'Boolean':
        return GraphQLBoolean;
      case 'Date':
        return DateScalar;
      case 'DateTime':
        return DateTimeScalar;
      case 'String':
      default:
        return GraphQLString;
    }
  }

  private getQueryName(csvName: string): string {
    const lowercased = csvName.charAt(0).toLowerCase() + csvName.slice(1);
    // Don't add 's' if the name already ends with 's'
    return lowercased.endsWith('s') ? lowercased : lowercased + 's';
  }

  private getRelationshipFieldName(relationship: Relationship): string {
    const baseName = relationship.references.charAt(0).toLowerCase() + relationship.references.slice(1);
    if (relationship.type === 'one-to-many') {
      // Don't add 's' if the name already ends with 's'
      return baseName.endsWith('s') ? baseName : baseName + 's';
    }
    return baseName;
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Checks if the filter contains any relationship-based filters
   */
  private hasRelationshipFilters(filters: any, relationships: Relationship[]): boolean {
    if (!filters || !relationships || relationships.length === 0) {
      return false;
    }

    const relationshipFieldNames = relationships.map(rel => this.getRelationshipFieldName(rel));
    
    return Object.keys(filters).some(filterKey => 
      relationshipFieldNames.includes(filterKey)
    );
  }

  /**
   * Applies filters to data using in-memory filtering (for relationship filters)
   */
  private applyFiltersToData<T extends Record<string, any>>(
    data: T[],
    filters: any,
    schema: FieldMetadata[]
  ): T[] {
    return applyFilters(data, filters);
  }
}