# Minimal Setup Example

This example shows the absolute minimum needed to get started with the GraphQL CSV API.

## 1. Create a Simple CSV

Create `data/csv/items.csv`:

```csv
id,name,price,available
1,Laptop,999.99,true
2,Mouse,29.99,true
3,Keyboard,79.99,false
4,Monitor,299.99,true
```

## 2. Create Minimal Metadata

Create `data/metadata/metadata.yaml`:

```yaml
csvs:
  - name: Items
    path: items.csv
```

That's it! The API will:
- Automatically infer field types (all will be String by default)
- Create GraphQL queries
- Enable filtering and pagination

## 3. Start and Query

```bash
npm start
```

Query your data:

```graphql
query {
  itemss {
    items {
      id
      name
      price
      available
    }
  }
}
```

## 4. Add Types (Optional)

For better type handling, update metadata.yaml:

```yaml
csvs:
  - name: Items
    path: items.csv
    fields:
      - name: id
        type: Int
      - name: name
        type: String
      - name: price
        type: Float
      - name: available
        type: Boolean
```

Then refresh: `curl -X POST http://localhost:4000/refresh-schema`

Now you can use typed filters:

```graphql
query {
  itemss(
    filter: {
      price: { lt: 100.0 }
      available: { eq: true }
    }
  ) {
    items {
      name
      price
    }
  }
}
```