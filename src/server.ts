import 'dotenv/config';
import express, { Express } from 'express';
import { ApolloServer } from 'apollo-server-express';
import cors from 'cors';
import { MetadataLoader } from './utils/metadata';
import { CSVLoader } from './data/loader';
import { DatabaseManager } from './data/database';
import { SchemaGenerator } from './schema/generator';

interface Config {
  dataSource: 'local' | 's3';
  localDataPath?: string;
  s3Bucket?: string;
  s3Prefix?: string;
  s3Region?: string;
  metadataFile: string;
  metadataDir: string;
  databasePath: string;
  port: number;
}

function getConfig(): Config {
  return {
    dataSource: (process.env.DATA_SOURCE as 'local' | 's3') || 'local',
    localDataPath: process.env.LOCAL_DATA_PATH || 'data/csv',
    s3Bucket: process.env.S3_BUCKET,
    s3Prefix: process.env.S3_PREFIX,
    s3Region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1',
    metadataFile: process.env.METADATA_FILE || 'metadata.yaml',
    metadataDir: process.env.METADATA_DIR || 'data/metadata',
    databasePath: process.env.DATABASE_PATH || './graphql-csv.db',
    port: parseInt(process.env.PORT || '4000', 10)
  };
}

let database: DatabaseManager | null = null;
let apolloServer: ApolloServer | null = null;

async function createApolloServer(config: Config): Promise<ApolloServer> {
  // Validate configuration
  if (config.dataSource === 's3' && !config.s3Bucket) {
    throw new Error('S3_BUCKET environment variable is required when DATA_SOURCE is s3');
  }

  // Initialize database
  if (!database) {
    database = new DatabaseManager(config.databasePath);
  }

  // Initialize metadata loader
  const metadataLoader = new MetadataLoader(config.metadataDir);
  const metadata = await metadataLoader.loadMetadata(config.metadataFile);

  // Initialize CSV loader
  const csvLoader = new CSVLoader({
    dataSource: config.dataSource,
    localPath: config.localDataPath,
    s3Bucket: config.s3Bucket,
    s3Prefix: config.s3Prefix,
    s3Region: config.s3Region,
    database
  });

  // Generate GraphQL schema
  const schemaGenerator = new SchemaGenerator(csvLoader, metadata, database);
  const schema = await schemaGenerator.generateSchema();

  // Create Apollo Server
  const server = new ApolloServer({
    schema,
    introspection: true,
    csrfPrevention: true,
    cache: 'bounded',
    context: ({ req }) => ({
      headers: req.headers,
      req
    }),
    formatError: (error) => {
      console.error('GraphQL Error:', error);
      return {
        message: error.message,
        code: error.extensions?.code,
        path: error.path,
        locations: error.locations
      };
    }
  });

  return server;
}

async function startServer() {
  const config = getConfig();
  const app = express();

  // Apply CORS middleware
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  }));

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Schema refresh endpoint
  app.post('/refresh-schema', async (req, res) => {
    try {
      console.log('Refreshing schema...');
      
      // Stop existing Apollo Server
      if (apolloServer) {
        await apolloServer.stop();
      }

      // Close and reopen database
      if (database) {
        database.close();
        database = null;
      }

      // Create new Apollo Server with fresh schema
      apolloServer = await createApolloServer(config);
      await apolloServer.start();
      apolloServer.applyMiddleware({ app: app as any, path: '/graphql' });

      res.json({
        success: true,
        message: 'Schema refreshed successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error refreshing schema:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to refresh schema',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  try {
    // Create and start Apollo Server
    apolloServer = await createApolloServer(config);
    await apolloServer.start();
    apolloServer.applyMiddleware({ app: app as any, path: '/graphql' });

    // Start Express server
    const server = app.listen(config.port, () => {
      console.log(`🚀 Server ready at http://localhost:${config.port}/graphql`);
      console.log(`📊 GraphQL Playground available at http://localhost:${config.port}/graphql`);
      console.log(`🔄 Refresh schema: POST http://localhost:${config.port}/refresh-schema`);
      console.log(`💚 Health check: GET http://localhost:${config.port}/health`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n🛑 Shutting down server...');
      
      // Stop accepting new connections
      server.close(async () => {
        console.log('Express server closed');
        
        // Stop Apollo Server
        if (apolloServer) {
          await apolloServer.stop();
          console.log('Apollo Server stopped');
        }

        // Close database
        if (database) {
          database.close();
          console.log('Database closed');
        }

        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();