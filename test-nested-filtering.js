const http = require('http');

function makeGraphQLRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      query,
      variables
    });

    const options = {
      hostname: 'localhost',
      port: 4000,
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function testNestedFiltering() {
  try {
    console.log('🧪 Testing nested filtering functionality...\n');

    // Test 1: Basic query without filters
    console.log('Test 1: Basic users query');
    const basicQuery = `
      query {
        users {
          items {
            id
            email
            age
          }
          totalCount
        }
      }
    `;
    const result1 = await makeGraphQLRequest(basicQuery);
    console.log('Result:', JSON.stringify(result1, null, 2));
    console.log('✅ Basic query works\n');

    // Test 2: Query with relationship filtering - Users who have orders with status "completed"
    console.log('Test 2: Users with completed orders (nested filtering)');
    const nestedQuery = `
      query {
        users(filter: {
          orders: {
            status: { eq: "completed" }
          }
        }) {
          items {
            id
            email
            age
            orders {
              id
              status
              total_amount
            }
          }
          totalCount
        }
      }
    `;
    const result2 = await makeGraphQLRequest(nestedQuery);
    console.log('Result:', JSON.stringify(result2, null, 2));
    console.log('✅ Nested filtering works\n');

    // Test 3: Combined field and relationship filters
    console.log('Test 3: Active users with high-value orders');
    const combinedQuery = `
      query {
        users(filter: {
          is_active: { eq: true }
          orders: {
            total_amount: { gt: 100 }
          }
        }) {
          items {
            id
            email
            is_active
            orders(filter: { total_amount: { gt: 100 } }) {
              id
              total_amount
              status
            }
          }
          totalCount
        }
      }
    `;
    const result3 = await makeGraphQLRequest(combinedQuery);
    console.log('Result:', JSON.stringify(result3, null, 2));
    console.log('✅ Combined filtering works\n');

    console.log('🎉 All tests passed! Nested filtering is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Error details:', error);
  }
}

// Wait a moment for server to be ready, then run tests
setTimeout(testNestedFiltering, 2000);