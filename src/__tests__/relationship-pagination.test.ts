import { SchemaGenerator } from '../schema/generator';
import { CSVLoader } from '../data/loader';
import { DatabaseManager } from '../data/database';
import { CSVMetadata, FieldMetadata } from '../schema/types';
import { graphql, GraphQLSchema } from 'graphql';
import * as fs from 'fs';

describe('Relationship Pagination', () => {
  let schemaGenerator: SchemaGenerator;
  let mockCSVLoader: jest.Mocked<CSVLoader>;
  let database: DatabaseManager;
  let schema: GraphQLSchema;
  const testDbPath = 'test-relationship-pagination.db';

  const usersMetadata: CSVMetadata = {
    name: 'Users',
    path: 'users.csv',
    fields: [
      { name: 'id', type: 'Int', description: 'User ID' },
      { name: 'email', type: 'String', description: 'Email' },
      { name: 'name', type: 'String', description: 'Name' },
      { name: 'is_active', type: 'Boolean', description: 'Active status' },
    ],
    relationships: [
      {
        field: 'id',
        references: 'Orders',
        referenceField: 'user_id',
        type: 'one-to-many'
      }
    ]
  };

  const ordersMetadata: CSVMetadata = {
    name: 'Orders',
    path: 'orders.csv',
    fields: [
      { name: 'id', type: 'Int', description: 'Order ID' },
      { name: 'user_id', type: 'Int', description: 'User ID' },
      { name: 'status', type: 'String', description: 'Order status' },
      { name: 'total_amount', type: 'Float', description: 'Total amount' },
      { name: 'created_date', type: 'Date', description: 'Created date' },
    ],
    relationships: [
      {
        field: 'user_id',
        references: 'Users',
        referenceField: 'id',
        type: 'one-to-one'
      }
    ]
  };

  beforeAll(async () => {
    database = new DatabaseManager(testDbPath);
    
    mockCSVLoader = {
      loadCSVIntoDatabase: jest.fn(),
      loadCSV: jest.fn(),
      inferSchema: jest.fn(),
    } as any;

    // Set up mock to return field schemas
    mockCSVLoader.inferSchema.mockImplementation((data: any[], fields?: FieldMetadata[]) => {
      return fields || [
        { name: 'id', type: 'Int' },
        { name: 'email', type: 'String' },
        { name: 'name', type: 'String' },
        { name: 'is_active', type: 'Boolean' },
      ];
    });

    schemaGenerator = new SchemaGenerator(mockCSVLoader, [usersMetadata, ordersMetadata], database);

    // Create tables and insert test data
    const userFields: FieldMetadata[] = [
      { name: 'id', type: 'Int' },
      { name: 'email', type: 'String' },
      { name: 'name', type: 'String' },
      { name: 'is_active', type: 'Boolean' }
    ];

    const orderFields: FieldMetadata[] = [
      { name: 'id', type: 'Int' },
      { name: 'user_id', type: 'Int' },
      { name: 'status', type: 'String' },
      { name: 'total_amount', type: 'Float' },
      { name: 'created_date', type: 'Date' }
    ];

    database.createTable('Users', userFields);
    database.createTable('Orders', orderFields);

    // Insert test users
    const testUsers = [
      { id: 1, email: 'john@example.com', name: 'John Doe', is_active: true },
      { id: 2, email: 'jane@example.com', name: 'Jane Smith', is_active: true },
      { id: 3, email: 'bob@example.com', name: 'Bob Johnson', is_active: false },
    ];

    // Insert many orders for user 1 to test pagination
    const testOrders = [];
    for (let i = 1; i <= 25; i++) {
      testOrders.push({
        id: i,
        user_id: 1,
        status: i % 2 === 0 ? 'completed' : 'pending',
        total_amount: 50.0 + i,
        created_date: `2023-01-${String(i).padStart(2, '0')}`
      });
    }

    // Add orders for other users
    testOrders.push(
      { id: 26, user_id: 2, status: 'completed', total_amount: 100.0, created_date: '2023-02-01' },
      { id: 27, user_id: 2, status: 'shipped', total_amount: 75.0, created_date: '2023-02-02' },
      { id: 28, user_id: 3, status: 'cancelled', total_amount: 25.0, created_date: '2023-02-03' }
    );

    database.insertData('Users', testUsers, userFields);
    database.insertData('Orders', testOrders, orderFields);

    // Generate GraphQL schema
    schema = await schemaGenerator.generateSchema();
  });

  afterAll(() => {
    database.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  describe('One-to-Many Relationship Pagination', () => {
    it('should paginate orders for a user with default pagination', async () => {
      const query = `
        query {
          users {
            items {
              id
              name
              orders {
                id
                status
                total_amount
              }
            }
          }
        }
      `;

      const result = await graphql({ schema, source: query });
      
      expect(result.errors).toBeUndefined();
      expect((result.data as any)?.users.items).toHaveLength(3);
      
      // Find user 1 who has 25 orders
      const user1 = (result.data as any)?.users.items.find((user: any) => user.id === 1);
      expect(user1).toBeDefined();
      expect(user1.orders).toHaveLength(25); // All orders returned (within default limit of 100)
    });

    it('should respect pagination limit parameter', async () => {
      const query = `
        query {
          users {
            items {
              id
              name
              orders(pagination: { limit: 5 }) {
                id
                status
                total_amount
              }
            }
          }
        }
      `;

      const result = await graphql({ schema, source: query });
      
      expect(result.errors).toBeUndefined();
      
      const user1 = (result.data as any)?.users.items.find((user: any) => user.id === 1);
      expect(user1).toBeDefined();
      expect(user1.orders).toHaveLength(5);
      
      // Should get first 5 orders (ids 1-5)
      const orderIds = user1.orders.map((order: any) => order.id).sort((a: number, b: number) => a - b);
      expect(orderIds).toEqual([1, 2, 3, 4, 5]);
    });

    it('should respect pagination offset parameter', async () => {
      const query = `
        query {
          users {
            items {
              id
              name
              orders(pagination: { offset: 10, limit: 5 }) {
                id
                status
                total_amount
              }
            }
          }
        }
      `;

      const result = await graphql({ schema, source: query });
      
      expect(result.errors).toBeUndefined();
      
      const user1 = (result.data as any)?.users.items.find((user: any) => user.id === 1);
      expect(user1).toBeDefined();
      expect(user1.orders).toHaveLength(5);
      
      // Should get orders 11-15 (offset 10, limit 5)
      const orderIds = user1.orders.map((order: any) => order.id).sort((a: number, b: number) => a - b);
      expect(orderIds).toEqual([11, 12, 13, 14, 15]);
    });

    it('should handle offset beyond available records', async () => {
      const query = `
        query {
          users {
            items {
              id
              name
              orders(pagination: { offset: 50, limit: 10 }) {
                id
                status
                total_amount
              }
            }
          }
        }
      `;

      const result = await graphql({ schema, source: query });
      
      expect(result.errors).toBeUndefined();
      
      const user1 = (result.data as any)?.users.items.find((user: any) => user.id === 1);
      expect(user1).toBeDefined();
      expect(user1.orders).toHaveLength(0); // No orders beyond offset 50
    });

    it('should combine pagination with filtering', async () => {
      const query = `
        query {
          users {
            items {
              id
              name
              orders(
                filter: { status: { eq: "completed" } }
                pagination: { limit: 3 }
              ) {
                id
                status
                total_amount
              }
            }
          }
        }
      `;

      const result = await graphql({ schema, source: query });
      
      expect(result.errors).toBeUndefined();
      
      const user1 = (result.data as any)?.users.items.find((user: any) => user.id === 1);
      expect(user1).toBeDefined();
      expect(user1.orders).toHaveLength(3);
      
      // All returned orders should have status "completed"
      user1.orders.forEach((order: any) => {
        expect(order.status).toBe('completed');
      });
    });

    it('should enforce maximum limit', async () => {
      const query = `
        query {
          users {
            items {
              id
              orders(pagination: { limit: 2000 }) {
                id
              }
            }
          }
        }
      `;

      const result = await graphql({ schema, source: query });
      
      expect(result.errors).toBeUndefined();
      
      const user1 = (result.data as any)?.users.items.find((user: any) => user.id === 1);
      expect(user1).toBeDefined();
      // Should be limited to 1000 max, but user only has 25 orders
      expect(user1.orders).toHaveLength(25);
    });
  });

  describe('One-to-One Relationship (No Pagination)', () => {
    it('should not add pagination parameters to one-to-one relationships', async () => {
      const query = `
        query {
          orders {
            items {
              id
              status
              users {
                id
                name
                email
              }
            }
          }
        }
      `;

      const result = await graphql({ schema, source: query });
      
      expect(result.errors).toBeUndefined();
      expect((result.data as any)?.orders.items).toHaveLength(28); // 25 + 3 orders
      
      // Each order should have exactly one user
      (result.data as any)?.orders.items.forEach((order: any) => {
        expect(order.users).toBeDefined();
        expect(typeof order.users).toBe('object');
        expect(order.users.id).toBeDefined();
        expect(order.users.name).toBeDefined();
      });
    });

    it('should handle filtering on one-to-one relationships', async () => {
      const query = `
        query {
          orders {
            items {
              id
              status
              users(filter: { is_active: { eq: true } }) {
                id
                name
                is_active
              }
            }
          }
        }
      `;

      const result = await graphql({ schema, source: query });
      
      expect(result.errors).toBeUndefined();
      
      // Orders belonging to inactive users should have null users when filtered
      const ordersWithActiveUsers = (result.data as any)?.orders.items.filter((order: any) => order.users !== null);
      const ordersWithInactiveUsers = (result.data as any)?.orders.items.filter((order: any) => order.users === null);
      
      expect(ordersWithActiveUsers.length).toBeGreaterThan(0);
      expect(ordersWithInactiveUsers.length).toBeGreaterThan(0); // Order 28 belongs to inactive user 3
      
      // All returned users should be active
      ordersWithActiveUsers.forEach((order: any) => {
        expect(order.users.is_active).toBe(true);
      });
    });
  });

  describe('Pagination Edge Cases', () => {
    it('should handle zero limit', async () => {
      const query = `
        query {
          users {
            items {
              id
              orders(pagination: { limit: 0 }) {
                id
              }
            }
          }
        }
      `;

      const result = await graphql({ schema, source: query });
      
      expect(result.errors).toBeUndefined();
      
      const user1 = (result.data as any)?.users.items.find((user: any) => user.id === 1);
      expect(user1.orders).toHaveLength(0);
    });

    it('should handle negative offset (treated as 0)', async () => {
      const query = `
        query {
          users {
            items {
              id
              orders(pagination: { offset: -5, limit: 3 }) {
                id
              }
            }
          }
        }
      `;

      const result = await graphql({ schema, source: query });
      
      expect(result.errors).toBeUndefined();
      
      const user1 = (result.data as any)?.users.items.find((user: any) => user.id === 1);
      expect(user1.orders).toHaveLength(3);
      
      // Should get first 3 orders (offset treated as 0)
      const orderIds = user1.orders.map((order: any) => order.id).sort((a: number, b: number) => a - b);
      expect(orderIds).toEqual([1, 2, 3]);
    });

    it('should handle user with no related records', async () => {
      // Insert a user with no orders
      database.insertData('Users', [{ id: 4, email: 'test@example.com', name: 'Test User', is_active: true }], [
        { name: 'id', type: 'Int' },
        { name: 'email', type: 'String' },
        { name: 'name', type: 'String' },
        { name: 'is_active', type: 'Boolean' }
      ]);

      const query = `
        query {
          users {
            items {
              id
              name
              orders(pagination: { limit: 10 }) {
                id
              }
            }
          }
        }
      `;

      const result = await graphql({ schema, source: query });
      
      expect(result.errors).toBeUndefined();
      
      const user4 = (result.data as any)?.users.items.find((user: any) => user.id === 4);
      expect(user4).toBeDefined();
      expect(user4.orders).toHaveLength(0);
    });
  });
});