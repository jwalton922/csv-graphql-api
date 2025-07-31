import { SchemaGenerator } from '../schema/generator';
import { CSVLoader } from '../data/loader';
import { DatabaseManager } from '../data/database';
import { GraphQLSchema, GraphQLObjectType, GraphQLString, GraphQLInt, isNonNullType, isListType } from 'graphql';

// Mock dependencies
jest.mock('../data/loader');
jest.mock('../data/database');

describe('SchemaGenerator', () => {
  let schemaGenerator: SchemaGenerator;
  let mockCSVLoader: jest.Mocked<CSVLoader>;
  let mockDatabase: jest.Mocked<DatabaseManager>;

  const mockMetadata = [
    {
      name: 'Users',
      path: 'users.csv',
      fields: [
        { name: 'id', type: 'Int' as const, description: 'User ID' },
        { name: 'name', type: 'String' as const, description: 'User name' },
        { name: 'email', type: 'String' as const },
        { name: 'age', type: 'Int' as const },
        { name: 'active', type: 'Boolean' as const }
      ],
      relationships: []
    },
    {
      name: 'Orders',
      path: 'orders.csv',
      fields: [
        { name: 'id', type: 'Int' as const },
        { name: 'user_id', type: 'Int' as const },
        { name: 'total', type: 'Float' as const },
        { name: 'order_date', type: 'Date' as const }
      ],
      relationships: [
        {
          field: 'user_id',
          references: 'Users',
          referenceField: 'id',
          type: 'one-to-one' as const
        }
      ]
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockCSVLoader = new CSVLoader({
      dataSource: 'local',
      database: {} as any
    }) as jest.Mocked<CSVLoader>;
    
    mockDatabase = new DatabaseManager() as jest.Mocked<DatabaseManager>;
    
    // Mock CSV loader methods
    mockCSVLoader.loadCSVIntoDatabase = jest.fn();
    mockCSVLoader.inferSchema = jest.fn();
    
    // Mock database query builder
    const mockQueryBuilder = {
      buildSelectQuery: jest.fn().mockReturnValue({ sql: 'SELECT * FROM test', params: [] }),
      buildCountQuery: jest.fn().mockReturnValue({ sql: 'SELECT COUNT(*) as count FROM test', params: [] })
    };
    
    schemaGenerator = new SchemaGenerator(mockCSVLoader, mockMetadata, mockDatabase);
  });

  describe('Schema Generation', () => {
    beforeEach(() => {
      // Mock sample data for schema inference
      mockDatabase.query = jest.fn()
        .mockReturnValueOnce([{ id: 1, name: 'John', email: 'john@test.com', age: 30, active: true }])
        .mockReturnValueOnce([{ id: 1, user_id: 1, total: 99.99, order_date: '2023-01-15' }]);

      mockCSVLoader.inferSchema = jest.fn()
        .mockReturnValueOnce([
          { name: 'id', type: 'Int' },
          { name: 'name', type: 'String' },
          { name: 'email', type: 'String' },
          { name: 'age', type: 'Int' },
          { name: 'active', type: 'Boolean' }
        ])
        .mockReturnValueOnce([
          { name: 'id', type: 'Int' },
          { name: 'user_id', type: 'Int' },
          { name: 'total', type: 'Float' },
          { name: 'order_date', type: 'Date' }
        ]);
    });

    it('should generate a complete GraphQL schema', async () => {
      const schema = await schemaGenerator.generateSchema();
      
      expect(schema).toBeInstanceOf(GraphQLSchema);
      expect(schema.getQueryType()).toBeDefined();
    });

    it('should load CSV data into database during schema generation', async () => {
      await schemaGenerator.generateSchema();
      
      expect(mockCSVLoader.loadCSVIntoDatabase).toHaveBeenCalledTimes(2);
      expect(mockCSVLoader.loadCSVIntoDatabase).toHaveBeenCalledWith(mockMetadata[0]);
      expect(mockCSVLoader.loadCSVIntoDatabase).toHaveBeenCalledWith(mockMetadata[1]);
    });

    it('should create GraphQL object types for each CSV', async () => {
      const schema = await schemaGenerator.generateSchema();
      const queryType = schema.getQueryType();
      
      expect(queryType).toBeDefined();
      
      const fields = queryType!.getFields();
      expect(fields.userss).toBeDefined(); // pluralized query name
      expect(fields.orderss).toBeDefined();
    });

    it('should create proper field types based on metadata', async () => {
      const schema = await schemaGenerator.generateSchema();
      const queryType = schema.getQueryType();
      const fields = queryType!.getFields();
      
      // Get the Users result type from the query field
      const usersField = fields.userss;
      expect(usersField).toBeDefined();
      
      const usersResultType = usersField.type as GraphQLObjectType;
      expect(usersResultType.name).toBe('UsersResult');
      
      const resultFields = usersResultType.getFields();
      expect(resultFields.items).toBeDefined();
      expect(resultFields.totalCount).toBeDefined();
      expect(resultFields.offset).toBeDefined();
      expect(resultFields.limit).toBeDefined();
    });
  });

  describe('Type Creation', () => {
    beforeEach(() => {
      mockDatabase.query = jest.fn().mockReturnValue([
        { id: 1, name: 'John', email: 'john@test.com', age: 30, active: true }
      ]);
      
      mockCSVLoader.inferSchema = jest.fn().mockReturnValue([
        { name: 'id', type: 'Int', description: 'User ID' },
        { name: 'name', type: 'String', description: 'User name' },
        { name: 'email', type: 'String' },
        { name: 'age', type: 'Int' },
        { name: 'active', type: 'Boolean' }
      ]);
    });

    it('should create object types with correct field types', async () => {
      const schema = await schemaGenerator.generateSchema();
      
      // We need to access the Users type through the schema
      const typeMap = schema.getTypeMap();
      const usersType = typeMap.Users as GraphQLObjectType;
      
      expect(usersType).toBeDefined();
      expect(usersType.name).toBe('Users');
      
      const fields = usersType.getFields();
      expect(fields.id.type).toBe(GraphQLInt);
      expect(fields.name.type).toBe(GraphQLString);
      expect(fields.email.type).toBe(GraphQLString);
    });

    it('should skip internal _rowid field', async () => {
      mockCSVLoader.inferSchema = jest.fn().mockReturnValue([
        { name: '_rowid', type: 'Int' },
        { name: 'id', type: 'Int' },
        { name: 'name', type: 'String' }
      ]);

      const schema = await schemaGenerator.generateSchema();
      const typeMap = schema.getTypeMap();
      const usersType = typeMap.Users as GraphQLObjectType;
      
      const fields = usersType.getFields();
      expect(fields._rowid).toBeUndefined();
      expect(fields.id).toBeDefined();
      expect(fields.name).toBeDefined();
    });
  });

  describe('Filter Type Creation', () => {
    beforeEach(() => {
      mockDatabase.query = jest.fn().mockReturnValue([
        { id: 1, name: 'John', age: 30 }
      ]);
      
      mockCSVLoader.inferSchema = jest.fn().mockReturnValue([
        { name: 'id', type: 'Int' },
        { name: 'name', type: 'String' },
        { name: 'age', type: 'Int' }
      ]);
    });

    it('should create filter input types for each CSV type', async () => {
      const schema = await schemaGenerator.generateSchema();
      const typeMap = schema.getTypeMap();
      
      expect(typeMap.UsersFilter).toBeDefined();
      expect(typeMap.UsersIdFilter).toBeDefined();
      expect(typeMap.UsersNameFilter).toBeDefined();
      expect(typeMap.UsersAgeFilter).toBeDefined();
    });

    it('should create field-specific filter types with all operators', async () => {
      const schema = await schemaGenerator.generateSchema();
      const typeMap = schema.getTypeMap();
      
      const nameFilterType = typeMap.UsersNameFilter as GraphQLObjectType;
      expect(nameFilterType).toBeDefined();
      
      const filterFields = nameFilterType.getFields();
      expect(filterFields.eq).toBeDefined();
      expect(filterFields.ne).toBeDefined();
      expect(filterFields.contains).toBeDefined();
      expect(filterFields.startsWith).toBeDefined();
      expect(filterFields.endsWith).toBeDefined();
    });
  });

  describe('Query Field Creation', () => {
    beforeEach(() => {
      mockDatabase.query = jest.fn()
        .mockReturnValueOnce([{ id: 1, name: 'John' }]) // For schema inference
        .mockReturnValueOnce([{ count: 5 }]) // For count query
        .mockReturnValueOnce([
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' }
        ]); // For select query
      
      mockCSVLoader.inferSchema = jest.fn().mockReturnValue([
        { name: 'id', type: 'Int' },
        { name: 'name', type: 'String' }
      ]);
    });

    it('should create query fields with correct names', async () => {
      const schema = await schemaGenerator.generateSchema();
      const queryType = schema.getQueryType();
      const fields = queryType!.getFields();
      
      expect(fields.userss).toBeDefined(); // Pluralized from 'Users'
      expect(fields.orderss).toBeDefined(); // Pluralized from 'Orders'
    });

    it('should create query fields with filter and pagination arguments', async () => {
      const schema = await schemaGenerator.generateSchema();
      const queryType = schema.getQueryType();
      const fields = queryType!.getFields();
      
      const usersField = fields.userss;
      const args = usersField.args;
      
      expect(args.find(arg => arg.name === 'filter')).toBeDefined();
      expect(args.find(arg => arg.name === 'pagination')).toBeDefined();
    });

    it('should execute queries and return paginated results', async () => {
      const schema = await schemaGenerator.generateSchema();
      const queryType = schema.getQueryType();
      const fields = queryType!.getFields();
      
      const usersField = fields.userss;
      const result = await usersField.resolve!(
        undefined, 
        { 
          filter: { name: { eq: 'John' } },
          pagination: { offset: 0, limit: 10 }
        },
        {},
        {} as any
      ) as any;
      
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('totalCount');
      expect(result).toHaveProperty('offset');
      expect(result).toHaveProperty('limit');
      expect(result.totalCount).toBe(5);
      expect(result.items).toHaveLength(2);
    });
  });

  describe('Relationship Handling', () => {
    beforeEach(() => {
      mockDatabase.query = jest.fn()
        .mockReturnValueOnce([{ id: 1, name: 'John' }]) // Users schema
        .mockReturnValueOnce([{ id: 1, user_id: 1, total: 99.99 }]) // Orders schema
        .mockReturnValue([{ id: 1, name: 'John' }]); // Relationship query
      
      mockCSVLoader.inferSchema = jest.fn()
        .mockReturnValueOnce([
          { name: 'id', type: 'Int' },
          { name: 'name', type: 'String' }
        ])
        .mockReturnValueOnce([
          { name: 'id', type: 'Int' },
          { name: 'user_id', type: 'Int' },
          { name: 'total', type: 'Float' }
        ]);
    });

    it('should add relationship fields to types', async () => {
      const schema = await schemaGenerator.generateSchema();
      const typeMap = schema.getTypeMap();
      
      const ordersType = typeMap.Orders as GraphQLObjectType;
      expect(ordersType).toBeDefined();
      
      const fields = ordersType.getFields();
      expect(fields.users).toBeDefined(); // Relationship field
    });

    it('should resolve one-to-one relationships', async () => {
      const schema = await schemaGenerator.generateSchema();
      const typeMap = schema.getTypeMap();
      
      const ordersType = typeMap.Orders as GraphQLObjectType;
      const fields = ordersType.getFields();
      const usersField = fields.users;
      
      const result = await usersField.resolve!(
        { user_id: 1 },
        {},
        {},
        {} as any
      );
      
      expect(result).toEqual({ id: 1, name: 'John' });
      expect(mockDatabase.query).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing schema gracefully', async () => {
      mockDatabase.query = jest.fn().mockReturnValue([]);
      mockCSVLoader.inferSchema = jest.fn().mockReturnValue([]);
      
      const schema = await schemaGenerator.generateSchema();
      const queryType = schema.getQueryType();
      const fields = queryType!.getFields();
      
      const usersField = fields.userss;
      const result = await usersField.resolve!(
        undefined,
        {},
        {},
        {} as any
      ) as any;
      
      expect(result).toEqual({
        items: [],
        totalCount: 0,
        offset: 0,
        limit: 100
      });
    });

    it('should handle database errors in resolvers', async () => {
      mockDatabase.query = jest.fn()
        .mockReturnValueOnce([{ id: 1, name: 'John' }]) // Schema inference
        .mockImplementationOnce(() => {
          throw new Error('Database error');
        });
      
      mockCSVLoader.inferSchema = jest.fn().mockReturnValue([
        { name: 'id', type: 'Int' },
        { name: 'name', type: 'String' }
      ]);
      
      const schema = await schemaGenerator.generateSchema();
      const queryType = schema.getQueryType();
      const fields = queryType!.getFields();
      
      const usersField = fields.userss;
      
      await expect(usersField.resolve!(
        undefined,
        {},
        {},
        {} as any
      )).rejects.toThrow('Database error');
    });
  });
});