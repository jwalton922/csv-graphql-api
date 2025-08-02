const { MetadataLoader } = require('../utils/metadata');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Mock fs module
jest.mock('fs');

describe('MetadataLoader', () => {
  let metadataLoader;
  const testMetadataDir = 'test/metadata';

  beforeEach(() => {
    jest.clearAllMocks();
    metadataLoader = new MetadataLoader(testMetadataDir);
  });

  describe('loadMetadata', () => {
    it('should load main metadata file successfully', async () => {
      const mainMetadata = {
        csvs: [
          {
            name: 'Users',
            path: 'users.csv',
            fields: [
              { name: 'id', type: 'Int' },
              { name: 'email', type: 'String' }
            ],
            relationships: []
          }
        ]
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(yaml.dump(mainMetadata));

      const result = await metadataLoader.loadMetadata('metadata.yaml');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Users');
      expect(result[0].fields).toHaveLength(2);
      expect(fs.existsSync).toHaveBeenCalledWith(path.join(testMetadataDir, 'metadata.yaml'));
    });

    it('should throw error when main metadata file is missing', async () => {
      fs.existsSync.mockReturnValue(false);

      await expect(metadataLoader.loadMetadata('missing.yaml'))
        .rejects.toThrow('Metadata file not found');
    });

    it('should throw error when metadata format is invalid', async () => {
      const invalidMetadata = { invalid: 'structure' };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(yaml.dump(invalidMetadata));

      await expect(metadataLoader.loadMetadata('metadata.yaml'))
        .rejects.toThrow('Invalid metadata format: missing or invalid "csvs" array');
    });

    it('should load and merge external metadata files', async () => {
      const mainMetadata = {
        csvs: [
          {
            name: 'Products',
            metadataFile: 'products.yaml',
            relationships: []
          }
        ]
      };

      const externalMetadata = {
        fields: [
          { name: 'id', type: 'Int' },
          { name: 'name', type: 'String' },
          { name: 'price', type: 'Float' }
        ]
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync
        .mockReturnValueOnce(yaml.dump(mainMetadata))
        .mockReturnValueOnce(yaml.dump(externalMetadata));

      const result = await metadataLoader.loadMetadata('metadata.yaml');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Products');
      expect(result[0].fields).toHaveLength(3);
      expect(result[0].fields[2].name).toBe('price');
      expect(result[0].fields[2].type).toBe('Float');
    });

    it('should throw error when external metadata file is missing', async () => {
      const mainMetadata = {
        csvs: [
          {
            name: 'Products',
            metadataFile: 'missing.yaml',
            relationships: []
          }
        ]
      };

      fs.existsSync
        .mockReturnValueOnce(true)  // main file exists
        .mockReturnValueOnce(false); // external file missing

      fs.readFileSync.mockReturnValue(yaml.dump(mainMetadata));

      await expect(metadataLoader.loadMetadata('metadata.yaml'))
        .rejects.toThrow('External metadata file not found');
    });

    it('should merge fields with external metadata overriding base fields', async () => {
      const mainMetadata = {
        csvs: [
          {
            name: 'Products',
            metadataFile: 'products.yaml',
            fields: [
              { name: 'id', type: 'String' }, // Will be overridden
              { name: 'category', type: 'String' } // Will remain
            ],
            relationships: []
          }
        ]
      };

      const externalMetadata = {
        fields: [
          { name: 'id', type: 'Int', description: 'Product ID' }, // Override
          { name: 'name', type: 'String' } // New field
        ]
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync
        .mockReturnValueOnce(yaml.dump(mainMetadata))
        .mockReturnValueOnce(yaml.dump(externalMetadata));

      const result = await metadataLoader.loadMetadata('metadata.yaml');

      expect(result[0].fields).toHaveLength(3);
      
      const idField = result[0].fields.find(f => f.name === 'id');
      expect(idField?.type).toBe('Int'); // Overridden
      expect(idField?.description).toBe('Product ID'); // From external
      
      const categoryField = result[0].fields.find(f => f.name === 'category');
      expect(categoryField?.type).toBe('String'); // Preserved
      
      const nameField = result[0].fields.find(f => f.name === 'name');
      expect(nameField?.type).toBe('String'); // Added from external
    });
  });

  describe('resolveCSVPath', () => {
    it('should resolve absolute paths as-is', () => {
      const csvMetadata = { name: 'Test', path: '/absolute/path/test.csv', fields: [], relationships: [] };
      
      const result = metadataLoader.resolveCSVPath(csvMetadata);
      
      expect(result).toBe('/absolute/path/test.csv');
    });

    it('should resolve relative paths relative to CSV directory', () => {
      const csvMetadata = { name: 'Test', path: 'subfolder/test.csv', fields: [], relationships: [] };
      
      const result = metadataLoader.resolveCSVPath(csvMetadata, 'data/csv');
      
      expect(result).toBe(path.join('data/csv', 'subfolder/test.csv'));
    });

    it('should use default CSV name when no path provided', () => {
      const csvMetadata = { name: 'Test', fields: [], relationships: [] };
      
      const result = metadataLoader.resolveCSVPath(csvMetadata, 'data/csv');
      
      expect(result).toBe(path.join('data/csv', 'Test.csv'));
    });
  });
});