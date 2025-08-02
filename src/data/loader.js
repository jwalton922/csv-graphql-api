const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const AWS = require('aws-sdk');
const { DatabaseManager } = require('./database');

class CSVLoader {
  constructor(config) {
    this.config = config;
    this.database = config.database;
    
    if (config.dataSource === 's3') {
      if (!config.s3Bucket) {
        throw new Error('S3 bucket name is required for S3 data source');
      }
      
      this.s3Client = new AWS.S3({
        region: config.s3Region || process.env.AWS_REGION || 'us-east-1'
      });
    }
  }

  async loadCSV(csvPath) {
    let csvContent;

    if (this.config.dataSource === 'local') {
      csvContent = await this.loadLocalCSV(csvPath);
    } else {
      csvContent = await this.loadS3CSV(csvPath);
    }

    const data = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    return data;
  }

  async loadLocalCSV(csvPath) {
    const basePath = this.config.localPath || 'data/csv';
    let fullPath;

    if (path.isAbsolute(csvPath)) {
      fullPath = csvPath;
    } else {
      fullPath = path.join(basePath, csvPath);
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error(`CSV file not found: ${fullPath}`);
    }

    return fs.readFileSync(fullPath, 'utf8');
  }

  async loadS3CSV(csvPath) {
    if (!this.s3Client || !this.config.s3Bucket) {
      throw new Error('S3 client not initialized');
    }

    const key = this.config.s3Prefix 
      ? path.join(this.config.s3Prefix, csvPath)
      : csvPath;

    try {
      const params = {
        Bucket: this.config.s3Bucket,
        Key: key
      };

      const response = await this.s3Client.getObject(params).promise();
      
      if (!response.Body) {
        throw new Error(`Empty response from S3 for key: ${key}`);
      }

      return response.Body.toString('utf8');
    } catch (error) {
      if (error.code === 'NoSuchKey') {
        throw new Error(`CSV file not found in S3: ${key}`);
      }
      throw new Error(`Failed to load CSV from S3: ${error.message}`);
    }
  }

  inferSchema(data, metadata) {
    if (!data || data.length === 0) {
      return metadata || [];
    }

    const firstRow = data[0];
    const columns = Object.keys(firstRow);
    
    // Create a map of metadata fields for quick lookup
    const metadataMap = new Map();
    if (metadata) {
      for (const field of metadata) {
        metadataMap.set(field.name, field);
      }
    }

    const schema = [];

    for (const column of columns) {
      const existingMetadata = metadataMap.get(column);
      
      if (existingMetadata) {
        // Use metadata if provided
        schema.push({
          name: column,
          type: existingMetadata.type || 'String',
          description: existingMetadata.description
        });
      } else {
        // Default to String type if not specified
        schema.push({
          name: column,
          type: 'String'
        });
      }
    }

    return schema;
  }

  parseValue(value, fieldType) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    switch (fieldType) {
      case 'Int':
        const intVal = parseInt(value, 10);
        return isNaN(intVal) ? null : intVal;
      
      case 'Float':
        const floatVal = parseFloat(value);
        return isNaN(floatVal) ? null : floatVal;
      
      case 'Boolean':
        const lowerVal = String(value).toLowerCase();
        return lowerVal === 'true' || lowerVal === '1' || lowerVal === 'yes';
      
      case 'Date':
      case 'DateTime':
        const dateVal = new Date(value);
        return isNaN(dateVal.getTime()) ? null : dateVal;
      
      case 'String':
      default:
        return String(value);
    }
  }

  parseRow(row, schema) {
    const parsed = {};
    
    for (const field of schema) {
      const value = row[field.name];
      parsed[field.name] = this.parseValue(value, field.type);
    }
    
    return parsed;
  }

  async loadCSVIntoDatabase(csvMetadata) {
    const csvPath = this.resolveCSVPath(csvMetadata);
    const data = await this.loadCSV(csvPath);
    const schema = this.inferSchema(data, csvMetadata.fields);

    // Create table with the CSV name
    this.database.createTable(csvMetadata.name, schema);

    // Insert data into the table
    this.database.insertData(csvMetadata.name, data, schema);
  }

  resolveCSVPath(csvMetadata) {
    console.log("Csv metadata",csvMetadata);
    if (csvMetadata.path) {
      return csvMetadata.path;
      // If path is absolute, use it as is
      // if (path.isAbsolute(csvMetadata.path)) {
      //   return csvMetadata.path;
      // }
      // // Otherwise, resolve relative to CSV directory
      // const basePath = this.config.localPath || 'data/csv';
      // return path.join(basePath, csvMetadata.path);
    }
    console.log("csvMetadata.paht not defined")
    // Default to CSV name with .csv extension
    const basePath = this.config.localPath || 'data/csv';
    return path.join(basePath, `${csvMetadata.name}.csv`);
  }
}

module.exports = { CSVLoader };