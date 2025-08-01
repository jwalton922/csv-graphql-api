import { applyNestedFilters } from '../data/filters';
import { DatabaseManager } from '../data/database';
import { Relationship } from '../schema/types';

describe('Nested Filtering', () => {
  let mockDatabase: jest.Mocked<DatabaseManager>;

  beforeEach(() => {
    mockDatabase = {
      query: jest.fn(),
      sanitizeIdentifier: jest.fn((id: string) => `"${id}"`),
      close: jest.fn(),
    } as any;
  });

  const sampleUsers = [
    { id: 1, email: 'john@example.com', age: 28, is_active: true },
    { id: 2, email: 'jane@example.com', age: 34, is_active: true },
    { id: 3, email: 'bob@example.com', age: 42, is_active: false },
    { id: 4, email: 'alice@example.com', age: 26, is_active: true },
  ];

  const sampleOrders = [
    { id: 101, user_id: 1, total_amount: 89.99, status: 'completed' },
    { id: 102, user_id: 2, total_amount: 156.50, status: 'completed' },
    { id: 103, user_id: 1, total_amount: 45.00, status: 'shipped' },
    { id: 104, user_id: 3, total_amount: 234.75, status: 'cancelled' },
    { id: 105, user_id: 4, total_amount: 67.25, status: 'completed' },
  ];

  const userOrdersRelationship: Relationship = {
    field: 'id',
    references: 'Orders',
    referenceField: 'user_id',
    type: 'one-to-many'
  };

  describe('applyNestedFilters', () => {
    it('should return all data when no filters are provided', () => {
      const result = applyNestedFilters(
        sampleUsers,
        {},
        [userOrdersRelationship],
        mockDatabase,
        'Users'
      );

      expect(result).toEqual(sampleUsers);
      expect(mockDatabase.query).not.toHaveBeenCalled();
    });

    it('should apply regular field filters correctly', () => {
      const filters = {
        is_active: { eq: true }
      };

      const result = applyNestedFilters(
        sampleUsers,
        filters,
        [userOrdersRelationship],
        mockDatabase,
        'Users'
      );

      expect(result).toHaveLength(3);
      expect(result.every(user => user.is_active === true)).toBe(true);
      expect(mockDatabase.query).not.toHaveBeenCalled();
    });

    it('should apply relationship filters correctly', () => {
      // Mock database to return orders for specific users
      mockDatabase.query.mockImplementation((sql: string, params: any[] = []) => {
        const userId = params[0];
        return sampleOrders.filter(order => order.user_id === userId);
      });

      const filters = {
        orders: {
          status: { eq: 'completed' }
        }
      };

      const result = applyNestedFilters(
        sampleUsers,
        filters,
        [userOrdersRelationship],
        mockDatabase,
        'Users'
      );

      // Should return users who have completed orders (users 1, 2, 4)
      expect(result).toHaveLength(3);
      expect(result.map(u => u.id).sort()).toEqual([1, 2, 4]);
      expect(mockDatabase.query).toHaveBeenCalledTimes(4); // Called for each user
    });

    it('should combine regular and relationship filters with AND logic', () => {
      // Mock database to return orders for specific users
      mockDatabase.query.mockImplementation((sql: string, params: any[] = []) => {
        const userId = params[0];
        return sampleOrders.filter(order => order.user_id === userId);
      });

      const filters = {
        is_active: { eq: true },
        orders: {
          total_amount: { gt: 100 }
        }
      };

      const result = applyNestedFilters(
        sampleUsers,
        filters,
        [userOrdersRelationship],
        mockDatabase,
        'Users'
      );

      // Should return active users who have orders > 100 (user 2 only)
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(2);
      expect(result[0].is_active).toBe(true);
    });

    it('should handle multiple relationship filter conditions', () => {
      mockDatabase.query.mockImplementation((sql: string, params: any[] = []) => {
        const userId = params[0];
        return sampleOrders.filter(order => order.user_id === userId);
      });

      const filters = {
        orders: {
          status: { eq: 'completed' },
          total_amount: { gt: 80 }
        }
      };

      const result = applyNestedFilters(
        sampleUsers,
        filters,
        [userOrdersRelationship],
        mockDatabase,
        'Users'
      );

      // Should return users with completed orders > 80 (users 1 and 2)
      expect(result).toHaveLength(2);
      expect(result.map(u => u.id).sort()).toEqual([1, 2]);
    });

    it('should handle users with no related records', () => {
      // Mock database to return empty for user 3
      mockDatabase.query.mockImplementation((sql: string, params: any[] = []) => {
        const userId = params[0];
        if (userId === 3) return [];
        return sampleOrders.filter(order => order.user_id === userId);
      });

      const filters = {
        orders: {
          status: { eq: 'completed' }
        }
      };

      const result = applyNestedFilters(
        sampleUsers,
        filters,
        [userOrdersRelationship],
        mockDatabase,
        'Users'
      );

      // Should not include user 3 (no orders)
      expect(result.map(u => u.id)).not.toContain(3);
    });

    it('should handle database errors gracefully', () => {
      mockDatabase.query.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const filters = {
        orders: {
          status: { eq: 'completed' }
        }
      };

      const result = applyNestedFilters(
        sampleUsers,
        filters,
        [userOrdersRelationship],
        mockDatabase,
        'Users'
      );

      // Should return empty result when database errors occur
      expect(result).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle null/undefined parent field values', () => {
      const usersWithNullIds = [
        { id: null, email: 'test@example.com', age: 30, is_active: true },
        { id: 1, email: 'john@example.com', age: 28, is_active: true },
      ];

      mockDatabase.query.mockImplementation((sql: string, params: any[] = []) => {
        const userId = params[0];
        return sampleOrders.filter(order => order.user_id === userId);
      });

      const filters = {
        orders: {
          status: { eq: 'completed' }
        }
      };

      const result = applyNestedFilters(
        usersWithNullIds,
        filters,
        [userOrdersRelationship],
        mockDatabase,
        'Users'
      );

      // Should only return user with valid id
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('should optimize performance by applying regular filters first', () => {
      const filters = {
        is_active: { eq: false }, // This will filter out most users first
        orders: {
          status: { eq: 'completed' }
        }
      };

      mockDatabase.query.mockImplementation((sql: string, params: any[] = []) => {
        const userId = params[0];
        return sampleOrders.filter(order => order.user_id === userId);
      });

      const result = applyNestedFilters(
        sampleUsers,
        filters,
        [userOrdersRelationship],
        mockDatabase,
        'Users'
      );

      // Should call database only for inactive users (just user 3)
      expect(mockDatabase.query).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(0); // User 3 has cancelled order, not completed
    });
  });

  describe('Filter field name mapping', () => {
    it('should correctly map relationship field names', () => {
      const oneToManyRelationship: Relationship = {
        field: 'id',
        references: 'Orders',
        referenceField: 'user_id',
        type: 'one-to-many'
      };

      const oneToOneRelationship: Relationship = {
        field: 'user_id',
        references: 'Users',
        referenceField: 'id',
        type: 'one-to-one'
      };

      mockDatabase.query.mockReturnValue([]);

      // Test one-to-many (should use plural form)
      applyNestedFilters(
        sampleUsers,
        { orders: { status: { eq: 'completed' } } },
        [oneToManyRelationship],
        mockDatabase,
        'Users'
      );

      // Test one-to-one (should use singular form)
      applyNestedFilters(
        sampleOrders,
        { user: { is_active: { eq: true } } },
        [oneToOneRelationship],
        mockDatabase,
        'Orders'
      );

      expect(mockDatabase.query).toHaveBeenCalled();
    });
  });
});