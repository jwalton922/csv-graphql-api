const { DatabaseManager } = require('../data/database');
const { SQLQueryBuilder } = require('../data/sql-builder');
const { FieldMetadata } = require('../schema/types');
const fs = require('fs');

describe('Date Filtering Integration', () => {
  let database;
  let queryBuilder;
  const testDbPath = 'test-dates.db';

  beforeAll(async () => {
    database = new DatabaseManager(testDbPath);
    queryBuilder = new SQLQueryBuilder(database);

    // Define field metadata
    const fields = [
      { name: 'id', type: 'Int' },
      { name: 'name', type: 'String' },
      { name: 'created_date', type: 'Date' },
      { name: 'created_datetime', type: 'DateTime' },
      { name: 'is_active', type: 'Boolean' }
    ];

    // Create table directly
    database.createTable('TestUsers', fields);

    // Insert test data directly
    const testData = [
      { id: 1, name: 'John', created_date: '2023-01-15', created_datetime: '2023-01-15T10:30:00.000Z', is_active: true },
      { id: 2, name: 'Jane', created_date: '2023-02-20', created_datetime: '2023-02-20T14:45:00.000Z', is_active: true },
      { id: 3, name: 'Bob', created_date: '2023-03-10', created_datetime: '2023-03-10T09:15:00.000Z', is_active: false },
      { id: 4, name: 'Alice', created_date: '2023-04-05', created_datetime: '2023-04-05T16:20:00.000Z', is_active: true },
      { id: 5, name: 'Charlie', created_date: '2023-12-25', created_datetime: '2023-12-25T12:00:00.000Z', is_active: false }
    ];

    database.insertData('TestUsers', testData, fields);
  });

  afterAll(() => {
    database.close();
    // Clean up test files
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  describe('Date Field Filtering', () => {
    it('should filter by exact date equality', () => {
      const { sql, params } = queryBuilder.buildSelectQuery('TestUsers', {
        created_date: { eq: '2023-01-15' }
      });

      const results = database.query(sql, params);
      
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('John');
      expect(results[0].created_date).toBe('2023-01-15');
    });

    it('should filter by date object equality', () => {
      const { sql, params } = queryBuilder.buildSelectQuery('TestUsers', {
        created_date: { eq: new Date('2023-01-15') }
      });

      const results = database.query(sql, params);
      
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('John');
    });

    it('should filter by date greater than', () => {
      const { sql, params } = queryBuilder.buildSelectQuery('TestUsers', {
        created_date: { gt: '2023-03-01' }
      });

      const results = database.query(sql, params);
      
      expect(results).toHaveLength(3);
      expect(results.map(r => r.name).sort()).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('should filter by date less than', () => {
      const { sql, params } = queryBuilder.buildSelectQuery('TestUsers', {
        created_date: { lt: '2023-03-01' }
      });

      const results = database.query(sql, params);
      
      expect(results).toHaveLength(2);
      expect(results.map(r => r.name).sort()).toEqual(['Jane', 'John']);
    });

    it('should filter by date range', () => {
      const { sql, params } = queryBuilder.buildSelectQuery('TestUsers', {
        created_date: { 
          gte: '2023-02-01',
          lte: '2023-04-01'
        }
      });

      const results = database.query(sql, params);
      
      expect(results).toHaveLength(2);
      expect(results.map(r => r.name).sort()).toEqual(['Bob', 'Jane']);
    });

    it('should filter by date in array', () => {
      const { sql, params } = queryBuilder.buildSelectQuery('TestUsers', {
        created_date: { 
          in: ['2023-01-15', '2023-03-10']
        }
      });

      const results = database.query(sql, params);
      
      expect(results).toHaveLength(2);
      expect(results.map(r => r.name).sort()).toEqual(['Bob', 'John']);
    });
  });

  describe('DateTime Field Filtering', () => {
    it('should filter by exact datetime equality', () => {
      const { sql, params } = queryBuilder.buildSelectQuery('TestUsers', {
        created_datetime: { eq: '2023-01-15T10:30:00.000Z' }
      });

      const results = database.query(sql, params);
      
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('John');
    });

    it('should filter by datetime object equality', () => {
      const { sql, params } = queryBuilder.buildSelectQuery('TestUsers', {
        created_datetime: { eq: new Date('2023-01-15T10:30:00.000Z') }
      });

      const results = database.query(sql, params);
      
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('John');
    });

    it('should filter by datetime greater than', () => {
      const { sql, params } = queryBuilder.buildSelectQuery('TestUsers', {
        created_datetime: { gt: '2023-02-20T14:45:00.000Z' }
      });

      const results = database.query(sql, params);
      
      expect(results).toHaveLength(3);
      expect(results.map(r => r.name).sort()).toEqual(['Alice', 'Bob', 'Charlie']);
    });
  });

  describe('Mixed Date and Non-Date Filtering', () => {
    it('should combine date and boolean filters', () => {
      const { sql, params } = queryBuilder.buildSelectQuery('TestUsers', {
        created_date: { gte: '2023-02-01' },
        is_active: { eq: true }
      });

      const results = database.query(sql, params);
      
      expect(results).toHaveLength(2);
      expect(results.map(r => r.name).sort()).toEqual(['Alice', 'Jane']);
    });

    it('should handle complex date filter combinations', () => {
      const { sql, params } = queryBuilder.buildSelectQuery('TestUsers', {
        created_date: { 
          gte: '2023-01-01',
          lt: '2023-06-01'
        },
        name: { ne: 'Bob' }
      });

      const results = database.query(sql, params);
      
      expect(results).toHaveLength(3);
      expect(results.map(r => r.name).sort()).toEqual(['Alice', 'Jane', 'John']);
    });
  });

  describe('Date Filter Edge Cases', () => {
    it('should handle invalid date strings gracefully', () => {
      const { sql, params } = queryBuilder.buildSelectQuery('TestUsers', {
        created_date: { eq: 'invalid-date' }
      });

      const results = database.query(sql, params);
      
      // Should return no results for invalid dates
      expect(results).toHaveLength(0);
    });

    it('should handle null date comparisons', () => {
      // First insert a record with null date using insertData method
      const nullRecord = [{ id: 6, name: 'NullDate', created_date: null, created_datetime: null, is_active: true }];
      const fields = [
        { name: 'id', type: 'Int' },
        { name: 'name', type: 'String' },
        { name: 'created_date', type: 'Date' },
        { name: 'created_datetime', type: 'DateTime' },
        { name: 'is_active', type: 'Boolean' }
      ];
      database.insertData('TestUsers', nullRecord, fields);

      const { sql, params } = queryBuilder.buildSelectQuery('TestUsers', {
        created_date: { eq: null }
      });

      const results = database.query(sql, params);
      
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('NullDate');
    });

    it('should handle empty date array in filter', () => {
      const { sql, params } = queryBuilder.buildSelectQuery('TestUsers', {
        created_date: { in: [] }
      });

      const results = database.query(sql, params);
      
      // Should return no results for empty array
      expect(results).toHaveLength(0);
    });
  });

  describe('Database Storage Verification', () => {
    it('should verify how dates are stored in the database', () => {
      // Check raw database storage
      const results = database.query('SELECT * FROM "TestUsers" WHERE name = ?', ['John']);
      
      expect(results).toHaveLength(1);
      console.log('Date stored as:', results[0].created_date, typeof results[0].created_date);
      console.log('DateTime stored as:', results[0].created_datetime, typeof results[0].created_datetime);
      
      // Dates should be stored as ISO strings in SQLite
      expect(typeof results[0].created_date).toBe('string');
      expect(typeof results[0].created_datetime).toBe('string');
    });
  });
});