import { CSVLoader } from '../data/loader';
import { DatabaseManager } from '../data/database';
import * as fs from 'fs';
import * as AWS from 'aws-sdk';

// Mock dependencies
jest.mock('fs');
jest.mock('aws-sdk');
jest.mock('../data/database');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockS3 = {
  getObject: jest.fn().mockReturnThis(),
  promise: jest.fn()
};

describe('CSVLoader', () => {
  let csvLoader: CSVLoader;
  let mockDatabase: jest.Mocked<DatabaseManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabase = new DatabaseManager() as jest.Mocked<DatabaseManager>;
    
    (AWS.S3 as jest.MockedClass<typeof AWS.S3>).mockImplementation(() => mockS3 as any);
  });

  describe('Local CSV Loading', () => {
    beforeEach(() => {
      csvLoader = new CSVLoader({
        dataSource: 'local',
        localPath: 'test/csv',
        database: mockDatabase
      });
    });

    it('should load local CSV file successfully', async () => {
      const csvContent = 'id,name,age\n1,John,30\n2,Jane,25';
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(csvContent);

      const result = await csvLoader.loadCSV('users.csv');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: '1', name: 'John', age: '30' });
      expect(result[1]).toEqual({ id: '2', name: 'Jane', age: '25' });
    });

    it('should throw error when local CSV file is missing', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await expect(csvLoader.loadCSV('missing.csv'))
        .rejects.toThrow('CSV file not found');
    });

    it('should handle absolute paths', async () => {
      const csvContent = 'id,name\n1,Test';
      const absolutePath = '/absolute/path/test.csv';
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(csvContent);

      await csvLoader.loadCSV(absolutePath);

      expect(mockFs.readFileSync).toHaveBeenCalledWith(absolutePath, 'utf8');
    });
  });

  describe('S3 CSV Loading', () => {
    beforeEach(() => {
      csvLoader = new CSVLoader({
        dataSource: 's3',
        s3Bucket: 'test-bucket',
        s3Prefix: 'csv',
        s3Region: 'us-east-1',
        database: mockDatabase
      });
    });

    it('should load CSV from S3 successfully', async () => {
      const csvContent = 'id,name,age\n1,John,30\n2,Jane,25';
      
      mockS3.promise.mockResolvedValue({
        Body: Buffer.from(csvContent)
      });

      const result = await csvLoader.loadCSV('users.csv');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: '1', name: 'John', age: '30' });
      expect(mockS3.getObject).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'csv/users.csv'
      });
    });

    it('should handle S3 key not found error', async () => {
      const error = new Error('Not found');
      (error as any).code = 'NoSuchKey';
      
      mockS3.promise.mockRejectedValue(error);

      await expect(csvLoader.loadCSV('missing.csv'))
        .rejects.toThrow('CSV file not found in S3');
    });

    it('should handle other S3 errors', async () => {
      const error = new Error('Access denied');
      
      mockS3.promise.mockRejectedValue(error);

      await expect(csvLoader.loadCSV('users.csv'))
        .rejects.toThrow('Failed to load CSV from S3');
    });

    it('should throw error when S3 bucket is not configured', () => {
      expect(() => new CSVLoader({
        dataSource: 's3',
        database: mockDatabase
      })).toThrow('S3 bucket name is required');
    });
  });

  describe('Schema Inference', () => {
    beforeEach(() => {
      csvLoader = new CSVLoader({
        dataSource: 'local',
        database: mockDatabase
      });
    });

    it('should infer schema from CSV data', () => {
      const data = [
        { id: '1', name: 'John', age: '30' },
        { id: '2', name: 'Jane', age: '25' }
      ];

      const schema = csvLoader.inferSchema(data);

      expect(schema).toHaveLength(3);
      expect(schema[0]).toEqual({ name: 'id', type: 'String' });
      expect(schema[1]).toEqual({ name: 'name', type: 'String' });
      expect(schema[2]).toEqual({ name: 'age', type: 'String' });
    });

    it('should apply metadata field types when provided', () => {
      const data = [
        { id: '1', name: 'John', age: '30', active: 'true' }
      ];

      const metadata = [
        { name: 'id', type: 'Int' as const },
        { name: 'age', type: 'Int' as const },
        { name: 'active', type: 'Boolean' as const, description: 'User status' }
      ];

      const schema = csvLoader.inferSchema(data, metadata);

      expect(schema).toHaveLength(4);
      expect(schema[0]).toEqual({ name: 'id', type: 'Int' });
      expect(schema[1]).toEqual({ name: 'name', type: 'String' }); // Default
      expect(schema[2]).toEqual({ name: 'age', type: 'Int' });
      expect(schema[3]).toEqual({ name: 'active', type: 'Boolean', description: 'User status' });
    });

    it('should return empty schema for empty data', () => {
      const schema = csvLoader.inferSchema([]);
      expect(schema).toEqual([]);
    });

    it('should return metadata even for empty data when provided', () => {
      const metadata = [
        { name: 'id', type: 'Int' as const },
        { name: 'name', type: 'String' as const }
      ];

      const schema = csvLoader.inferSchema([], metadata);
      expect(schema).toEqual(metadata);
    });
  });

  describe('Value Parsing', () => {
    beforeEach(() => {
      csvLoader = new CSVLoader({
        dataSource: 'local',
        database: mockDatabase
      });
    });

    it('should parse integer values', () => {
      expect(csvLoader.parseValue('123', 'Int')).toBe(123);
      expect(csvLoader.parseValue('0', 'Int')).toBe(0);
      expect(csvLoader.parseValue('invalid', 'Int')).toBeNull();
      expect(csvLoader.parseValue('', 'Int')).toBeNull();
    });

    it('should parse float values', () => {
      expect(csvLoader.parseValue('123.45', 'Float')).toBe(123.45);
      expect(csvLoader.parseValue('0.0', 'Float')).toBe(0.0);
      expect(csvLoader.parseValue('invalid', 'Float')).toBeNull();
    });

    it('should parse boolean values', () => {
      expect(csvLoader.parseValue('true', 'Boolean')).toBe(true);
      expect(csvLoader.parseValue('TRUE', 'Boolean')).toBe(true);
      expect(csvLoader.parseValue('1', 'Boolean')).toBe(true);
      expect(csvLoader.parseValue('yes', 'Boolean')).toBe(true);
      expect(csvLoader.parseValue('false', 'Boolean')).toBe(false);
      expect(csvLoader.parseValue('0', 'Boolean')).toBe(false);
      expect(csvLoader.parseValue('no', 'Boolean')).toBe(false);
    });

    it('should parse date values', () => {
      const result = csvLoader.parseValue('2023-01-15', 'Date');
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString().split('T')[0]).toBe('2023-01-15');
      
      expect(csvLoader.parseValue('invalid-date', 'Date')).toBeNull();
    });

    it('should parse datetime values', () => {
      const result = csvLoader.parseValue('2023-01-15T10:30:00Z', 'DateTime');
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe('2023-01-15T10:30:00.000Z');
    });

    it('should parse string values', () => {
      expect(csvLoader.parseValue('hello', 'String')).toBe('hello');
      expect(csvLoader.parseValue(123, 'String')).toBe('123');
      expect(csvLoader.parseValue('', 'String')).toBeNull();
    });

    it('should handle null and undefined values', () => {
      expect(csvLoader.parseValue(null, 'String')).toBeNull();
      expect(csvLoader.parseValue(undefined, 'Int')).toBeNull();
      expect(csvLoader.parseValue('', 'Boolean')).toBeNull();
    });
  });

  describe('Row Parsing', () => {
    beforeEach(() => {
      csvLoader = new CSVLoader({
        dataSource: 'local',
        database: mockDatabase
      });
    });

    it('should parse a complete row according to schema', () => {
      const row = { id: '1', name: 'John', age: '30', active: 'true' };
      const schema = [
        { name: 'id', type: 'Int' as const },
        { name: 'name', type: 'String' as const },
        { name: 'age', type: 'Int' as const },
        { name: 'active', type: 'Boolean' as const }
      ];

      const result = csvLoader.parseRow(row, schema);

      expect(result).toEqual({
        id: 1,
        name: 'John',
        age: 30,
        active: true
      });
    });
  });

  describe('Database Integration', () => {
    beforeEach(() => {
      csvLoader = new CSVLoader({
        dataSource: 'local',
        localPath: 'test/csv',
        database: mockDatabase
      });
    });

    it('should load CSV into database', async () => {
      const csvContent = 'id,name,age\n1,John,30\n2,Jane,25';
      const csvMetadata = {
        name: 'Users',
        path: 'users.csv',
        fields: [
          { name: 'id', type: 'Int' as const },
          { name: 'name', type: 'String' as const },
          { name: 'age', type: 'Int' as const }
        ],
        relationships: []
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(csvContent);

      await csvLoader.loadCSVIntoDatabase(csvMetadata);

      expect(mockDatabase.createTable).toHaveBeenCalledWith('Users', expect.any(Array));
      expect(mockDatabase.insertData).toHaveBeenCalledWith('Users', expect.any(Array), expect.any(Array));
    });
  });
});