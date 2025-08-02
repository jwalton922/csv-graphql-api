const { applyFilters, isValidFilter } = require('../data/filters');

describe('Filter Logic', () => {
  const testData = [
    { id: 1, name: 'John', age: 30, email: 'john@example.com', active: true, created: new Date('2023-01-15') },
    { id: 2, name: 'Jane', age: 25, email: 'jane@example.com', active: false, created: new Date('2023-02-20') },
    { id: 3, name: 'Bob', age: 35, email: 'bob@test.com', active: true, created: new Date('2023-03-10') },
    { id: 4, name: 'Alice', age: 28, email: 'alice@example.com', active: true, created: new Date('2023-04-05') },
    { id: 5, name: null, age: null, email: null, active: null, created: null }
  ];

  describe('Equality Filters', () => {
    it('should filter by exact equality (eq)', () => {
      const filters = { age: { eq: 30 } };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('John');
    });

    it('should filter by not equal (ne)', () => {
      const filters = { age: { ne: 30 } };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(4);
      expect(result.find(item => item.name === 'John')).toBeUndefined();
    });

    it('should handle null equality', () => {
      const filters = { name: { eq: null } };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(5);
    });

    it('should handle null inequality', () => {
      const filters = { name: { ne: null } };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(4);
      expect(result.find(item => item.id === 5)).toBeUndefined();
    });
  });

  describe('Comparison Filters', () => {
    it('should filter by greater than (gt)', () => {
      const filters = { age: { gt: 30 } };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Bob');
    });

    it('should filter by greater than or equal (gte)', () => {
      const filters = { age: { gte: 30 } };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(2);
      expect(result.map(item => item.name).sort()).toEqual(['Bob', 'John']);
    });

    it('should filter by less than (lt)', () => {
      const filters = { age: { lt: 30 } };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(2);
      expect(result.map(item => item.name).sort()).toEqual(['Alice', 'Jane']);
    });

    it('should filter by less than or equal (lte)', () => {
      const filters = { age: { lte: 30 } };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(3);
      expect(result.map(item => item.name).sort()).toEqual(['Alice', 'Jane', 'John']);
    });

    it('should handle date comparisons', () => {
      const filters = { created: { gte: new Date('2023-02-01') } };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(3);
      expect(result.map(item => item.name).sort()).toEqual(['Alice', 'Bob', 'Jane']);
    });

    it('should handle date string comparisons', () => {
      const filters = { created: { lt: '2023-03-01' } };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(2);
      expect(result.map(item => item.name).sort()).toEqual(['Jane', 'John']);
    });
  });

  describe('Array Membership Filter', () => {
    it('should filter by value in array (in)', () => {
      const filters = { age: { in: [25, 35] } };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(2);
      expect(result.map(item => item.name).sort()).toEqual(['Bob', 'Jane']);
    });

    it('should handle empty in array', () => {
      const filters = { age: { in: [] } };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(0);
    });

    it('should handle null in array', () => {
      const filters = { name: { in: [null, 'John'] } };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(2);
      expect(result.map(item => item.id).sort()).toEqual([1, 5]);
    });

    it('should handle date arrays', () => {
      const filters = { 
        created: { 
          in: [new Date('2023-01-15'), new Date('2023-03-10')] 
        } 
      };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(2);
      expect(result.map(item => item.name).sort()).toEqual(['Bob', 'John']);
    });
  });

  describe('String Filters', () => {
    it('should filter by contains', () => {
      const filters = { email: { contains: 'example' } };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(3);
      expect(result.map(item => item.name).sort()).toEqual(['Alice', 'Jane', 'John']);
    });

    it('should filter by startsWith', () => {
      const filters = { name: { startsWith: 'J' } };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(2);
      expect(result.map(item => item.name).sort()).toEqual(['Jane', 'John']);
    });

    it('should filter by endsWith', () => {
      const filters = { email: { endsWith: 'test.com' } };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Bob');
    });

    it('should handle string operations on non-string values', () => {
      const filters = { age: { contains: '3' } };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(2);
      expect(result.map(item => item.age).sort()).toEqual([30, 35]);
    });

    it('should handle string operations on null values', () => {
      const filters = { name: { contains: 'test' } };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(0);
    });
  });

  describe('Combined Filters', () => {
    it('should apply multiple filters on same field (AND logic)', () => {
      const filters = { 
        age: { 
          gt: 25, 
          lt: 35 
        } 
      };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(2);
      expect(result.map(item => item.name).sort()).toEqual(['Alice', 'John']);
    });

    it('should apply filters on multiple fields (AND logic)', () => {
      const filters = { 
        age: { gte: 25 },
        active: { eq: true }
      };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(3);
      expect(result.map(item => item.name).sort()).toEqual(['Alice', 'Bob', 'John']);
    });

    it('should handle complex combined filters', () => {
      const filters = {
        age: { gte: 25, lte: 35 },
        email: { contains: 'example' },
        active: { eq: true }
      };
      const result = applyFilters(testData, filters);
      
      expect(result).toHaveLength(2);
      expect(result.map(item => item.name).sort()).toEqual(['Alice', 'John']);
    });
  });

  describe('Edge Cases', () => {
    it('should return all data when no filters provided', () => {
      const result = applyFilters(testData, {});
      expect(result).toEqual(testData);
    });

    it('should return all data when filters object is empty', () => {
      const result = applyFilters(testData, {});
      expect(result).toEqual(testData);
    });

    it('should handle empty data array', () => {
      const filters = { age: { eq: 30 } };
      const result = applyFilters([], filters);
      expect(result).toEqual([]);
    });

    it('should handle non-existent field filters', () => {
      const filters = { nonExistentField: { eq: 'value' } };
      const result = applyFilters(testData, filters);
      expect(result).toHaveLength(0);
    });

    it('should handle filter with no matching data', () => {
      const filters = { age: { eq: 999 } };
      const result = applyFilters(testData, filters);
      expect(result).toHaveLength(0);
    });
  });

  describe('Filter Validation', () => {
    it('should validate correct filter objects', () => {
      const validFilter = {
        age: { eq: 30, gt: 25 },
        name: { contains: 'John' }
      };
      
      expect(isValidFilter(validFilter)).toBe(true);
    });

    it('should reject invalid filter structure', () => {
      expect(isValidFilter(null)).toBe(false);
      expect(isValidFilter(undefined)).toBe(false);
      expect(isValidFilter('string')).toBe(false);
      expect(isValidFilter(123)).toBe(false);
    });

    it('should reject filters with invalid operators', () => {
      const invalidFilter = {
        age: { invalidOperator: 30 }
      };
      
      expect(isValidFilter(invalidFilter)).toBe(false);
    });

    it('should reject nested invalid field filters', () => {
      const invalidFilter = {
        age: 'not an object'
      };
      
      expect(isValidFilter(invalidFilter)).toBe(false);
    });

    it('should accept empty filter object', () => {
      expect(isValidFilter({})).toBe(true);
    });
  });
});