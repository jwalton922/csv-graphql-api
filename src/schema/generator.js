const {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLList,
  GraphQLNonNull,
  GraphQLInputObjectType,
} = require('graphql');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { CSVLoader } = require('../data/loader');
const { DatabaseManager } = require('../data/database');
const { SQLQueryBuilder } = require('../data/sql-builder');
const { DateScalar, DateTimeScalar } = require('./scalars');
const { applyFilters, applyNestedFilters } = require('../data/filters');

class SchemaGenerator {
  constructor(csvLoader, metadata, database) {
    this.csvLoader = csvLoader;
    this.metadata = metadata;
    this.database = database;
    this.queryBuilder = new SQLQueryBuilder(database);
    this.types = new Map();
    this.filterTypes = new Map();
    this.resultTypes = new Map();
    this.schemas = new Map();
  }

  async generateSchema() {
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
    const queryFields = {};
    
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

  async createBasicType(csvMeta) {
    try {
      // Get schema from first row of data
      const { sql, params } = this.queryBuilder.buildSelectQuery(csvMeta.name, undefined, { limit: 1 });
      const sampleData = this.database.query(sql, params);
      
      const schema = this.csvLoader.inferSchema(sampleData || [], csvMeta.fields);
      this.schemas.set(csvMeta.name, schema);
    } catch (error) {
      console.error(`Error creating type for ${csvMeta.name}:`, error);
      // Set a minimal schema if query fails
      this.schemas.set(csvMeta.name, csvMeta.fields || []);
    }

    // Create GraphQL type with fields function for lazy evaluation
    const type = new GraphQLObjectType({
      name: csvMeta.name,
      fields: () => {
        const fields = {};
        const schema = this.schemas.get(csvMeta.name) || [];

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
            resolve: (parent, args) => {
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

  addRelationshipFields(csvMeta) {
    // This method is no longer needed since relationships are handled in createBasicType
    // Keep for backward compatibility but make it empty
  }

  createFilterType(csvMeta) {
    const schema = this.schemas.get(csvMeta.name);
    if (!schema) return;

    const filterType = new GraphQLInputObjectType({
      name: `${csvMeta.name}Filter`,
      fields: () => {
        const filterFields = {};

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

  createResultType(csvMeta) {
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

  createQueryField(csvMeta) {
    const resultType = this.resultTypes.get(csvMeta.name);
    const filterType = this.filterTypes.get(csvMeta.name);

    if (!resultType) {
      throw new Error(`Result type not found for ${csvMeta.name}`);
    }

    const args = {
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
      resolve: async (_, args) => {
        const schema = this.schemas.get(csvMeta.name);
        if (!schema) {
          return { items: [], totalCount: 0, offset: 0, limit: 100 };
        }

        const offset = args.pagination?.offset || 0;
        const limit = Math.min(args.pagination?.limit || 100, 1000); // Max 1000 items

        // Check if we have relationship filters that require nested filtering
        const hasRelationshipFilters = this.hasRelationshipFilters(args.filter, csvMeta.relationships);
        
        let items;
        let totalCount;
        
        if (hasRelationshipFilters) {
          // Use nested filtering approach - get all data first, then filter in memory
          try {
            const allDataQuery = this.queryBuilder.buildSelectQuery(csvMeta.name);
            const allData = this.database.query(allDataQuery.sql, allDataQuery.params) || [];
            
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
          } catch (error) {
            console.error(`Error with nested filtering for ${csvMeta.name}:`, error);
            items = [];
            totalCount = 0;
          }
        } else {
          // Use SQL-based filtering for regular field filters
          try {
            const countQuery = this.queryBuilder.buildCountQuery(csvMeta.name, args.filter);
            const countResult = this.database.query(countQuery.sql, countQuery.params);
            totalCount = countResult && countResult[0] ? countResult[0].count : 0;

            const selectQuery = this.queryBuilder.buildSelectQuery(
              csvMeta.name,
              args.filter,
              { offset, limit }
            );
            items = this.database.query(selectQuery.sql, selectQuery.params);
          } catch (error) {
            console.error(`Error querying ${csvMeta.name}:`, error);
            items = [];
            totalCount = 0;
          }
        }

        // Ensure items is an array
        if (!Array.isArray(items)) {
          items = [];
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

  async resolveRelationship(parent, relationship, filter, pagination) {
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

  getGraphQLType(fieldType) {
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

  getQueryName(csvName) {
    const lowercased = csvName.charAt(0).toLowerCase() + csvName.slice(1);
    // Don't add 's' if the name already ends with 's'
    return lowercased.endsWith('s') ? lowercased : lowercased + 's';
  }

  getRelationshipFieldName(relationship) {
    const baseName = relationship.references.charAt(0).toLowerCase() + relationship.references.slice(1);
    if (relationship.type === 'one-to-many') {
      // Don't add 's' if the name already ends with 's'
      return baseName.endsWith('s') ? baseName : baseName + 's';
    }
    return baseName;
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Checks if the filter contains any relationship-based filters
   */
  hasRelationshipFilters(filters, relationships) {
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
  applyFiltersToData(data, filters, schema) {
    return applyFilters(data, filters);
  }
}

module.exports = { SchemaGenerator };