import { SchemaGenerator } from '../schema/generator';
import { CSVLoader } from '../data/loader';
import { DatabaseManager } from '../data/database';
import { CSVMetadata } from '../schema/types';

describe('SchemaGenerator Nested Filtering', () => {
  let schemaGenerator: SchemaGenerator;
  let mockCSVLoader: jest.Mocked<CSVLoader>;
  let mockDatabase: jest.Mocked<DatabaseManager>;

  const mockMetadata: CSVMetadata[] = [
    {
      name: 'Users',
      path: 'users.csv',
      fields: [
        { name: 'id', type: 'Int', description: 'User ID' },
        { name: 'email', type: 'String', description: 'Email' },
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
    },
    {
      name: 'Orders',
      path: 'orders.csv',
      fields: [
        { name: 'id', type: 'Int', description: 'Order ID' },
        { name: 'user_id', type: 'Int', description: 'User ID' },
        { name: 'status', type: 'String', description: 'Order status' },
        { name: 'total_amount', type: 'Float', description: 'Total amount' },
      ],
      relationships: [
        {
          field: 'user_id',
          references: 'Users',
          referenceField: 'id',
          type: 'one-to-one'
        }
      ]
    }
  ];

  beforeEach(() => {
    mockCSVLoader = {
      loadCSVIntoDatabase: jest.fn(),
      inferSchema: jest.fn(),
    } as any;

    mockDatabase = {
      query: jest.fn(),
      sanitizeIdentifier: jest.fn((id: string) => `"${id}"`),
      close: jest.fn(),
    } as any;

    schemaGenerator = new SchemaGenerator(mockCSVLoader, mockMetadata, mockDatabase);
  });

  describe('hasRelationshipFilters', () => {
    it('should correctly identify relationship filters', () => {
      // Access private method for testing
      const hasRelationshipFilters = (schemaGenerator as any).hasRelationshipFilters.bind(schemaGenerator);

      const filtersWithRelationships = {
        is_active: { eq: true },
        orders: { status: { eq: 'completed' } }
      };

      const filtersWithoutRelationships = {
        is_active: { eq: true },
        email: { contains: 'example' }
      };

      const result1 = hasRelationshipFilters(filtersWithRelationships, mockMetadata[0].relationships);
      const result2 = hasRelationshipFilters(filtersWithoutRelationships, mockMetadata[0].relationships);

      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });

    it('should return false for empty filters or relationships', () => {
      const hasRelationshipFilters = (schemaGenerator as any).hasRelationshipFilters.bind(schemaGenerator);

      expect(hasRelationshipFilters(null, mockMetadata[0].relationships)).toBe(false);
      expect(hasRelationshipFilters({}, mockMetadata[0].relationships)).toBe(false);
      expect(hasRelationshipFilters({ orders: { status: { eq: 'completed' } } }, [])).toBe(false);
    });
  });

  describe('getQueryName', () => {
    it('should generate correct query names', () => {
      const getQueryName = (schemaGenerator as any).getQueryName.bind(schemaGenerator);

      expect(getQueryName('Users')).toBe('users');
      expect(getQueryName('Orders')).toBe('orders');
      expect(getQueryName('Products')).toBe('products');
      expect(getQueryName('Categories')).toBe('categories');
    });

    it('should not add extra "s" to names already ending with "s"', () => {
      const getQueryName = (schemaGenerator as any).getQueryName.bind(schemaGenerator);

      expect(getQueryName('Status')).toBe('status');
      expect(getQueryName('Address')).toBe('address');
      expect(getQueryName('News')).toBe('news');
    });
  });

  describe('Schema Generation with Nested Filtering', () => {
    beforeEach(() => {
      mockCSVLoader.inferSchema.mockReturnValue([
        { name: 'id', type: 'Int' },
        { name: 'email', type: 'String' },
        { name: 'is_active', type: 'Boolean' },
      ]);

      mockDatabase.query.mockReturnValue([
        { id: 1, email: 'test@example.com', is_active: true }
      ]);
    });

    it('should generate schema with relationship filter types', async () => {
      const schema = await schemaGenerator.generateSchema();

      expect(schema).toBeDefined();
      expect(mockCSVLoader.loadCSVIntoDatabase).toHaveBeenCalledTimes(2);
    });

    it('should handle filter input types correctly', () => {
      // This tests that the filter types are created with relationship fields
      const createFilterType = (schemaGenerator as any).createFilterType.bind(schemaGenerator);
      
      // Mock the internal state
      (schemaGenerator as any).schemas = new Map([
        ['Users', [
          { name: 'id', type: 'Int' },
          { name: 'email', type: 'String' },
          { name: 'is_active', type: 'Boolean' },
        ]]
      ]);
      (schemaGenerator as any).filterTypes = new Map();

      expect(() => createFilterType(mockMetadata[0])).not.toThrow();
    });
  });

  describe('Query Resolution with Nested Filtering', () => {
    it('should use nested filtering when relationship filters are present', () => {
      const hasRelationshipFilters = (schemaGenerator as any).hasRelationshipFilters.bind(schemaGenerator);

      const filtersWithRelationships = {
        orders: { status: { eq: 'completed' } }
      };

      const filtersWithoutRelationships = {
        is_active: { eq: true }
      };

      expect(hasRelationshipFilters(filtersWithRelationships, mockMetadata[0].relationships)).toBe(true);
      expect(hasRelationshipFilters(filtersWithoutRelationships, mockMetadata[0].relationships)).toBe(false);
    });
  });

  describe('Relationship Field Name Generation', () => {
    it('should generate correct relationship field names', () => {
      const getRelationshipFieldName = (schemaGenerator as any).getRelationshipFieldName.bind(schemaGenerator);

      const oneToManyRelationship = {
        field: 'id',
        references: 'Orders',
        referenceField: 'user_id',
        type: 'one-to-many'
      };

      const oneToOneRelationship = {
        field: 'user_id',
        references: 'Users',
        referenceField: 'id',
        type: 'one-to-one'
      };

      expect(getRelationshipFieldName(oneToManyRelationship)).toBe('orders');
      expect(getRelationshipFieldName(oneToOneRelationship)).toBe('users');
    });

    it('should handle relationship field names correctly for filtering', () => {
      const getRelationshipFieldName = (schemaGenerator as any).getRelationshipFieldName.bind(schemaGenerator);

      // Test with different entity names
      expect(getRelationshipFieldName({
        field: 'id',
        references: 'Products',
        referenceField: 'category_id',
        type: 'one-to-many'
      })).toBe('products');

      expect(getRelationshipFieldName({
        field: 'category_id',
        references: 'Categories',
        referenceField: 'id',
        type: 'one-to-one'
      })).toBe('categories');
    });
  });
});