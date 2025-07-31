# GraphQL CSV API

A Node.js GraphQL API that automatically generates schemas and queries from CSV files. Built with TypeScript, Apollo Server, Express, and SQLite.

## Features

- 🔄 **Dynamic Schema Generation**: Automatically creates GraphQL types from CSV metadata
- 📊 **Multiple Data Sources**: Support for local files and AWS S3
- 🔍 **Advanced Filtering**: Rich filter operators (eq, ne, gt, lt, contains, etc.)
- 📄 **Pagination**: Built-in offset/limit pagination
- 🔗 **Relationships**: Define relationships between CSV files
- 🎯 **Type Safety**: Full TypeScript support with custom scalars
- ⚡ **Express Server**: Runs as a standard Node.js application
- 🗄️ **SQLite Backend**: Efficient querying with SQL-based filtering
- 🔥 **Hot Reload**: Refresh schema without restarting the server

## Quick Start

### Prerequisites

- Node.js 18+ (recommended: Node.js 22)
- npm or yarn
- SQLite3 (automatically installed with better-sqlite3)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd graphql-csv-api

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Build the project
npm run build
```

### Local Development

```bash
# Start development server with auto-reload
npm run dev

# Or build and run production server
npm run build
npm start
```

### Access the API

- GraphQL Endpoint: http://localhost:4000/graphql
- GraphQL Playground: http://localhost:4000/graphql
- Health Check: http://localhost:4000/health
- Schema Refresh: POST http://localhost:4000/refresh-schema

## Configuration

Create a `.env` file in the project root (see `.env.example` for all options):

### Local Mode (Default)

Store CSV files locally in the `data/csv/` directory:

```env
# Server
PORT=4000
NODE_ENV=development

# Data Source
DATA_SOURCE=local
LOCAL_DATA_PATH=data/csv
METADATA_DIR=data/metadata
METADATA_FILE=metadata.yaml

# Database
DATABASE_PATH=./graphql-csv.db
```

### S3 Mode

Store CSV files in AWS S3:

```env
# Data Source
DATA_SOURCE=s3
S3_BUCKET=your-csv-bucket
S3_PREFIX=csv
S3_REGION=us-east-1

# AWS Credentials
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
```

## Metadata File Format

### Main Metadata File (`data/metadata.yaml`)

```yaml
csvs:
  - name: Users
    path: users.csv
    fields:
      - name: id
        type: Int
        description: Unique user identifier
      - name: email
        type: String
        description: User email address
      - name: created_at
        type: DateTime
        description: Account creation timestamp
      - name: age
        type: Int
      - name: is_active
        type: Boolean
    relationships: []

  - name: Orders
    path: orders.csv
    fields:
      - name: id
        type: Int
      - name: user_id
        type: Int
      - name: order_date
        type: Date
      - name: total_amount
        type: Float
      - name: status
        type: String
    relationships:
      - field: user_id
        references: Users
        referenceField: id
        type: one-to-one

  - name: Products
    metadataFile: products.yaml  # External metadata file
    path: products.csv
    relationships: []
```

### External Metadata File (`data/metadata/products.yaml`)

```yaml
fields:
  - name: id
    type: Int
    description: Unique product identifier
  - name: name
    type: String
    description: Product name
  - name: price
    type: Float
    description: Product price in dollars
  - name: category
    type: String
  - name: in_stock
    type: Boolean
```

### Supported Field Types

- `String` - Text values
- `Int` - Integer numbers
- `Float` - Decimal numbers
- `Boolean` - true/false values
- `Date` - Date in YYYY-MM-DD format
- `DateTime` - ISO 8601 timestamp

### Relationship Types

- `one-to-one` - Single related record
- `one-to-many` - Multiple related records

## Adding New CSV Files

### 1. Create the CSV File

Add your CSV file to `data/csv/` (or upload to S3):

```csv
id,name,department,salary,hire_date
1,John Doe,Engineering,75000,2023-01-15
2,Jane Smith,Marketing,65000,2023-02-20
```

### 2. Update Metadata

Add the new CSV to your `metadata.yaml`:

```yaml
csvs:
  # ... existing CSVs
  - name: Employees
    path: employees.csv
    fields:
      - name: id
        type: Int
      - name: name
        type: String
      - name: department
        type: String
      - name: salary
        type: Float
      - name: hire_date
        type: Date
    relationships: []
```

### 3. Refresh Schema

```bash
# Refresh the GraphQL schema without restarting
curl -X POST http://localhost:4000/refresh-schema
```

## Deployment

### Using Docker

Create a `Dockerfile`:

```dockerfile
FROM node:22-alpine

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built application
COPY dist ./dist
COPY data ./data

# Create directory for SQLite database
RUN mkdir -p /app/db

# Expose port
EXPOSE 4000

# Start server
CMD ["node", "dist/server.js"]
```

Build and run:

```bash
# Build Docker image
docker build -t graphql-csv-api .

# Run container
docker run -p 4000:4000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/db:/app/db \
  -e DATABASE_PATH=/app/db/graphql-csv.db \
  graphql-csv-api
```

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start dist/server.js --name graphql-csv-api \
  --instances 1 \
  --watch false \
  --env production

# Or use ecosystem file
```

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'graphql-csv-api',
    script: './dist/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

```bash
# Start with ecosystem file
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save
pm2 startup
```

### Using systemd (Linux)

Create `/etc/systemd/system/graphql-csv-api.service`:

```ini
[Unit]
Description=GraphQL CSV API
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/opt/graphql-csv-api
ExecStart=/usr/bin/node /opt/graphql-csv-api/dist/server.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=4000

[Install]
WantedBy=multi-user.target
```

```bash
# Reload systemd and start service
sudo systemctl daemon-reload
sudo systemctl enable graphql-csv-api
sudo systemctl start graphql-csv-api
```

### Production Deployment Checklist

1. **Environment Variables**
   ```bash
   NODE_ENV=production
   PORT=4000
   DATABASE_PATH=/var/lib/graphql-csv/db/graphql.db
   CORS_ORIGIN=https://your-domain.com
   ```

2. **Security Considerations**
   - Use a reverse proxy (nginx/Apache) for SSL termination
   - Set appropriate CORS origins
   - Limit request size and rate limiting
   - Use read-only database access where possible

3. **Performance Optimization**
   - Use persistent volume for SQLite database
   - Enable query depth limiting in Apollo Server
   - Monitor memory usage for large CSV files
   - Consider using Redis for caching (future enhancement)

4. **Monitoring**
   - Health check endpoint: `/health`
   - Application logs
   - Database file size
   - Memory and CPU usage

## GraphQL Queries

### Basic Queries

```graphql
# Get all users
query {
  userss {
    items {
      id
      email
      age
      is_active
    }
    totalCount
    offset
    limit
  }
}
```

### Queries with Filters

```graphql
# Filter by age and active status
query {
  userss(
    filter: {
      age: { gte: 25, lte: 40 }
      is_active: { eq: true }
    }
  ) {
    items {
      id
      email
      age
    }
    totalCount
  }
}

# String filters
query {
  userss(
    filter: {
      email: { contains: "example.com" }
    }
  ) {
    items {
      id
      email
    }
  }
}

# Array membership
query {
  orderss(
    filter: {
      status: { in: ["completed", "shipped"] }
    }
  ) {
    items {
      id
      status
      total_amount
    }
  }
}
```

### Available Filter Operators

- `eq` - Equal to
- `ne` - Not equal to
- `gt` - Greater than
- `gte` - Greater than or equal
- `lt` - Less than
- `lte` - Less than or equal
- `in` - Value in array
- `contains` - String contains (case-sensitive)
- `startsWith` - String starts with
- `endsWith` - String ends with

### Queries with Pagination

```graphql
query {
  userss(
    pagination: {
      offset: 0
      limit: 10
    }
  ) {
    items {
      id
      email
    }
    totalCount
    offset
    limit
  }
}
```

### Queries with Relationships

```graphql
# Get orders with user information
query {
  orderss {
    items {
      id
      order_date
      total_amount
      status
      users {  # one-to-one relationship
        id
        email
        name
      }
    }
  }
}

# For one-to-many relationships
query {
  userss {
    items {
      id
      email
      orders {  # one-to-many relationship
        id
        total_amount
        order_date
      }
    }
  }
}
```

### Complex Queries

```graphql
# Combine filters, pagination, and relationships
query {
  orderss(
    filter: {
      total_amount: { gte: 100.0 }
      order_date: { gte: "2023-01-01" }
      status: { ne: "cancelled" }
    }
    pagination: {
      offset: 0
      limit: 20
    }
  ) {
    items {
      id
      order_date
      total_amount
      status
      users {
        id
        email
        age
      }
    }
    totalCount
  }
}
```

## Schema Refresh

### Manual Refresh

Update the schema without restarting the server:

```bash
curl -X POST http://localhost:4000/refresh-schema
```

### Response

```json
{
  "success": true,
  "message": "Schema refreshed successfully",
  "timestamp": "2023-12-01T10:30:00.000Z"
}
```

### Health Check

```bash
curl http://localhost:4000/health
```

### Response

```json
{
  "status": "healthy",
  "timestamp": "2023-12-01T10:30:00.000Z"
}
```

## GraphQL Introspection

The API supports GraphQL introspection and includes a GraphQL Playground:

```graphql
# Get schema information
query {
  __schema {
    types {
      name
      fields {
        name
        type {
          name
        }
      }
    }
  }
}
```

## Development Scripts

```bash
# Development
npm run dev          # Watch, rebuild, and restart server
npm run watch        # TypeScript watch mode
npm run build        # Build for production

# Production
npm start            # Start production server
npm run start:prod   # Start with NODE_ENV=production

# Testing
npm test             # Run Jest tests

# Utilities
npm run clean        # Clean build directory
```

## Error Handling

### Common Issues

1. **CSV File Not Found**
   ```json
   {
     "errors": [{
       "message": "CSV file not found: users.csv"
     }]
   }
   ```

2. **Invalid Filter**
   ```json
   {
     "errors": [{
       "message": "Invalid filter operator: invalidOp"
     }]
   }
   ```

3. **Schema Refresh Failed**
   ```json
   {
     "success": false,
     "message": "Failed to refresh schema",
     "error": "Metadata file not found"
   }
   ```

## Architecture

### Components

1. **Express Server** (`src/server.ts`)
   - HTTP server with middleware
   - GraphQL endpoint integration
   - Health check and schema refresh endpoints

2. **Schema Generator** (`src/schema/generator.ts`)
   - Dynamically creates GraphQL types from CSV metadata
   - Generates filter and pagination types
   - Handles relationships between CSVs

3. **Data Layer** (`src/data/`)
   - **CSVLoader**: Loads CSV from local filesystem or S3
   - **DatabaseManager**: SQLite database operations
   - **SQLQueryBuilder**: Converts GraphQL filters to SQL

4. **Metadata System** (`src/utils/metadata.ts`)
   - YAML-based configuration
   - External metadata file support
   - Schema inference from CSV data

### Data Flow

```
1. Server Start
   ├── Load metadata.yaml
   ├── Load CSV files into SQLite
   ├── Generate GraphQL schema
   └── Start Express server

2. GraphQL Query
   ├── Parse GraphQL query
   ├── Build SQL query with filters
   ├── Execute on SQLite
   └── Return paginated results

3. Schema Refresh
   ├── Reload metadata
   ├── Rebuild SQLite tables
   ├── Regenerate GraphQL schema
   └── Update Apollo Server
```

## Performance Considerations

- **SQLite Indexing**: Automatic indexes created for all fields
- **Pagination Limits**: Maximum 1000 items per query
- **Database Connection**: Single persistent connection per server instance
- **Schema Caching**: GraphQL schema cached until refresh
- **Memory Usage**: Monitor memory usage for large CSV files

### Optimization Tips

1. **For Large Datasets**
   - Use pagination to limit result size
   - Add composite indexes for common filter combinations
   - Consider partitioning large CSV files

2. **For High Traffic**
   - Run multiple instances behind a load balancer
   - Use separate read-only database copies
   - Implement query complexity analysis

3. **For Complex Relationships**
   - Limit relationship depth
   - Use DataLoader pattern for N+1 query prevention
   - Consider denormalizing frequently joined data

## Troubleshooting

### Common Issues

1. **"Cannot find native module" error**
   ```bash
   # Rebuild better-sqlite3
   npm rebuild better-sqlite3
   ```

2. **Permission denied on database**
   ```bash
   # Ensure write permissions
   chmod 644 graphql-csv.db
   chown $USER graphql-csv.db
   ```

3. **Schema not updating**
   ```bash
   # Force schema refresh
   curl -X POST http://localhost:4000/refresh-schema
   
   # Or delete database and restart
   rm graphql-csv.db
   npm start
   ```

4. **Memory issues with large CSV**
   - Increase Node.js memory limit: `node --max-old-space-size=4096 dist/server.js`
   - Split large CSV files into smaller chunks
   - Use streaming CSV parser (future enhancement)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass: `npm test`
5. Submit a pull request

### Development Setup

```bash
# Install all dependencies including dev
npm install

# Run tests
npm test

# Run tests in watch mode
npm test -- --watch

# Check TypeScript types
npm run build
```

## Future Enhancements

- [ ] Streaming CSV parser for large files
- [ ] Redis caching layer
- [ ] GraphQL subscriptions for real-time updates
- [ ] Multi-database support (PostgreSQL, MySQL)
- [ ] CSV upload endpoint
- [ ] Schema versioning
- [ ] Query cost analysis
- [ ] DataLoader integration

## License

MIT License - see LICENSE file for details.