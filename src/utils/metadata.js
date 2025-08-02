const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class MetadataLoader {
  constructor(metadataDir = 'data/metadata') {
    this.metadataDir = metadataDir;
  }

  async loadMetadata(metadataFile = 'metadata.yaml') {
    const mainMetadataPath = path.join(this.metadataDir, metadataFile);
    
    if (!fs.existsSync(mainMetadataPath)) {
      throw new Error(`Metadata file not found: ${mainMetadataPath}`);
    }

    const mainContent = fs.readFileSync(mainMetadataPath, 'utf8');
    const mainMetadata = yaml.load(mainContent);

    if (!mainMetadata.csvs || !Array.isArray(mainMetadata.csvs)) {
      throw new Error('Invalid metadata format: missing or invalid "csvs" array');
    }

    const mergedMetadata = [];

    for (const csvMetadata of mainMetadata.csvs) {
      if (csvMetadata.metadataFile) {
        const externalMetadata = await this.loadExternalMetadata(csvMetadata.metadataFile);
        mergedMetadata.push(this.mergeMetadata(csvMetadata, externalMetadata));
      } else {
        mergedMetadata.push(this.normalizeMetadata(csvMetadata));
      }
    }

    return mergedMetadata;
  }

  async loadExternalMetadata(metadataFile) {
    const externalPath = path.join(this.metadataDir, metadataFile);
    
    if (!fs.existsSync(externalPath)) {
      throw new Error(`External metadata file not found: ${externalPath}`);
    }

    const content = fs.readFileSync(externalPath, 'utf8');
    const externalMetadata = yaml.load(content);

    return externalMetadata;
  }

  mergeMetadata(base, external) {
    const merged = {
      name: base.name,
      path: external.path || base.path,
      metadataFile: base.metadataFile,
      fields: this.mergeFields(base.fields || [], external.fields || []),
      relationships: this.mergeRelationships(base.relationships || [], external.relationships || [])
    };

    return this.normalizeMetadata(merged);
  }

  mergeFields(baseFields, externalFields) {
    const fieldMap = new Map();

    // Add base fields first
    for (const field of baseFields) {
      fieldMap.set(field.name, { ...field });
    }

    // Override or add external fields
    for (const field of externalFields) {
      if (fieldMap.has(field.name)) {
        // Merge with existing field
        const existing = fieldMap.get(field.name);
        fieldMap.set(field.name, {
          ...existing,
          ...field,
          // Preserve description if not overridden
          description: field.description || existing.description
        });
      } else {
        fieldMap.set(field.name, { ...field });
      }
    }

    return Array.from(fieldMap.values());
  }

  mergeRelationships(baseRels, externalRels) {
    const relMap = new Map();

    // Add base relationships
    for (const rel of baseRels) {
      const key = `${rel.field}-${rel.references}-${rel.referenceField}`;
      relMap.set(key, { ...rel });
    }

    // Override or add external relationships
    for (const rel of externalRels) {
      const key = `${rel.field}-${rel.references}-${rel.referenceField}`;
      relMap.set(key, { ...rel });
    }

    return Array.from(relMap.values());
  }

  normalizeMetadata(metadata) {
    return {
      name: metadata.name,
      path: metadata.path,
      metadataFile: metadata.metadataFile,
      fields: metadata.fields || [],
      relationships: metadata.relationships || []
    };
  }

  resolveCSVPath(csvMetadata, csvDir = 'data/csv') {
    if (csvMetadata.path) {
      // If path is absolute, use it as is
      if (path.isAbsolute(csvMetadata.path)) {
        return csvMetadata.path;
      }
      // Otherwise, resolve relative to CSV directory
      return path.join(csvDir, csvMetadata.path);
    }
    // Default to CSV name with .csv extension
    return path.join(csvDir, `${csvMetadata.name}.csv`);
  }
}

module.exports = { MetadataLoader };