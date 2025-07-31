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
          
          fields[fieldName] = {
            type: relationship.type === 'one-to-many' 
              ? new GraphQLList(relatedType)
              : relatedType,
            resolve: (parent: any) => {
              return this.resolveRelationship(parent, relationship);
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

    const filterFields: { [key: string]: GraphQLInputFieldConfig } = {};

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

    const filterType = new GraphQLInputObjectType({
      name: `${csvMeta.name}Filter`,
      fields: filterFields,
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

        // Build and execute count query
        const countQuery = this.queryBuilder.buildCountQuery(csvMeta.name, args.filter);
        const countResult = this.database.query(countQuery.sql, countQuery.params)[0] as { count: number };
        const totalCount = countResult.count;

        // Build and execute select query
        const selectQuery = this.queryBuilder.buildSelectQuery(
          csvMeta.name,
          args.filter,
          { offset, limit }
        );
        const items = this.database.query(selectQuery.sql, selectQuery.params);

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


  private async resolveRelationship(parent: any, relationship: Relationship): Promise<any> {
    const parentValue = parent[relationship.field];
    if (parentValue === null || parentValue === undefined) return null;

    const { sql, params } = this.queryBuilder.buildRelationshipQuery(
      '', // from table not needed
      relationship.field,
      relationship.references,
      relationship.referenceField,
      parentValue,
      relationship.type === 'one-to-many'
    );

    const results = this.database.query(sql, params);

    // Remove _rowid from results
    const cleanedResults = results.map(item => {
      const { _rowid, ...rest } = item;
      return rest;
    });

    return relationship.type === 'one-to-many' ? cleanedResults : cleanedResults[0] || null;
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
    return csvName.charAt(0).toLowerCase() + csvName.slice(1) + 's';
  }

  private getRelationshipFieldName(relationship: Relationship): string {
    const baseName = relationship.references.charAt(0).toLowerCase() + relationship.references.slice(1);
    return relationship.type === 'one-to-many' ? baseName + 's' : baseName;
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}