# GraphQL CSV API - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### 1. Clone and Install

```bash
git clone <repository-url>
cd graphql-csv-api
npm install
cp .env.example .env
```

### 2. Build and Start

```bash
npm run build
npm start
```

Your GraphQL API is now running at http://localhost:4000/graphql

### 3. Try Your First Query

Open http://localhost:4000/graphql in your browser and run:

```graphql
query {
  userss {
    items {
      id
      email
      age
    }
    totalCount
  }
}
```

## 📁 Project Structure

```
graphql-csv-api/
├── data/
│   ├── csv/              # Your CSV files
│   │   ├── users.csv
│   │   ├── orders.csv
│   │   └── products.csv
│   └── metadata/         # Metadata configuration
│       ├── metadata.yaml # Main configuration
│       └── products.yaml # External metadata example
├── src/                  # Source code
├── dist/                 # Compiled JavaScript
└── .env                  # Environment configuration
```

## 🔧 Adding Your Own CSV Files

### Step 1: Add Your CSV File

Place your CSV file in `data/csv/employees.csv`:

```csv
id,name,department,salary
1,John Doe,Engineering,75000
2,Jane Smith,Marketing,65000
3,Bob Johnson,Sales,55000
```

### Step 2: Update Metadata

Edit `data/metadata.yaml`:

```yaml
csvs:
  # ... existing CSVs ...
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
```

### Step 3: Refresh Schema

```bash
curl -X POST http://localhost:4000/refresh-schema
```

### Step 4: Query Your Data

```graphql
query {
  employeess(
    filter: {
      department: { eq: "Engineering" }
      salary: { gte: 70000 }
    }
  ) {
    items {
      id
      name
      salary
    }
  }
}
```

## 🔍 Common Operations

### Filter by Multiple Conditions

```graphql
query {
  userss(
    filter: {
      age: { gte: 25, lte: 40 }
      is_active: { eq: true }
    }
  ) {
    items {
      email
      age
    }
  }
}
```

### Paginate Results

```graphql
query {
  productss(
    pagination: { offset: 0, limit: 10 }
  ) {
    items {
      name
      price
    }
    totalCount
    offset
    limit
  }
}
```

### Search Text Fields

```graphql
query {
  productss(
    filter: {
      name: { contains: "Phone" }
    }
  ) {
    items {
      name
      price
    }
  }
}
```

### Query Relationships

```graphql
query {
  orderss {
    items {
      id
      total_amount
      users {
        email
      }
    }
  }
}
```

## 🛠️ Configuration Options

### Using S3 for CSV Storage

Edit your `.env`:

```env
DATA_SOURCE=s3
S3_BUCKET=my-csv-bucket
S3_PREFIX=csv-files
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
```

### Change Server Port

```env
PORT=8080
```

### Production Mode

```bash
NODE_ENV=production npm start
```

## 📚 Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Check [examples/queries.graphql](examples/queries.graphql) for more query examples
- Learn about [relationships and advanced features](README.md#relationship-types)
- Deploy to production using [Docker or PM2](README.md#deployment)

## 🆘 Need Help?

- **Schema not updating?** Run: `curl -X POST http://localhost:4000/refresh-schema`
- **Can't connect?** Check if port 4000 is available
- **CSV not loading?** Verify file exists in `data/csv/` directory
- **Type errors?** Check your metadata.yaml field types match CSV data

Happy querying! 🎉