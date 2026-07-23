const http = require('http');

const BASE_URL = 'http://localhost:3000';

async function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('🚀 E2E Test Suite Starting...\n');
  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Health Check
  console.log('Test 1: Health Check');
  try {
    const res = await makeRequest('GET', '/health');
    if (res.status === 200 && res.body.status === 'ok') {
      console.log('✅ Server is healthy\n');
      testsPassed++;
    } else {
      console.log('❌ Server health check failed\n');
      testsFailed++;
    }
  } catch (err) {
    console.log('❌ Health check error:', err.message, '\n');
    testsFailed++;
  }

  // Test 2: Signup
  console.log('Test 2: User Signup');
  let signupToken = null;
  let userId = null;
  try {
    const res = await makeRequest('POST', '/api/v1/auth/register', {
      email: `test_${Date.now()}@example.com`,
      password: 'TestPassword123!',
      name: 'Test User',
      phone: `99999${String(Math.random()).slice(2, 7)}`
    });
    if (res.status === 201 && res.body.token) {
      signupToken = res.body.token;
      userId = res.body.user?._id || res.body.user?.id;
      console.log('✅ Signup successful, token obtained\n');
      testsPassed++;
    } else {
      console.log('❌ Signup failed:', res.body?.error || 'Unknown error\n');
      testsFailed++;
    }
  } catch (err) {
    console.log('❌ Signup error:', err.message, '\n');
    testsFailed++;
  }

  // Test 3: Signin
  console.log('Test 3: User Signin');
  let signinToken = null;
  const testEmail = `test_${Date.now()}@example.com`;
  try {
    // First create an account
    await makeRequest('POST', '/api/v1/auth/register', {
      email: testEmail,
      password: 'TestPassword123!',
      name: 'Signin Test User',
      phone: `99999${String(Math.random()).slice(2, 7)}`
    });
    
    // Now try to signin
    const res = await makeRequest('POST', '/api/v1/auth/login', {
      email: testEmail,
      password: 'TestPassword123!'
    });
    if (res.status === 200 && res.body.token) {
      signinToken = res.body.token;
      console.log('✅ Signin successful, token obtained\n');
      testsPassed++;
    } else {
      console.log('❌ Signin failed:', res.body?.error || 'Unknown error\n');
      testsFailed++;
    }
  } catch (err) {
    console.log('❌ Signin error:', err.message, '\n');
    testsFailed++;
  }

  // Test 4: Get Profile (Session persistence)
  console.log('Test 4: Session Persistence - Get Profile');
  try {
    if (!signinToken) {
      console.log('⏭️ Skipped: No signin token\n');
      testsFailed++;
    } else {
      const res = await makeRequest('GET', '/api/v1/auth/me', null, {
        Authorization: `Bearer ${signinToken}`
      });
      if (res.status === 200 && res.body.email) {
        console.log('✅ Profile retrieved successfully\n');
        testsPassed++;
      } else {
        console.log('❌ Profile retrieval failed\n');
        testsFailed++;
      }
    }
  } catch (err) {
    console.log('❌ Profile retrieval error:', err.message, '\n');
    testsFailed++;
  }

  // Test 5: Update Profile
  console.log('Test 5: Update User Profile');
  try {
    if (!signinToken) {
      console.log('⏭️ Skipped: No signin token\n');
      testsFailed++;
    } else {
      const res = await makeRequest('PUT', '/api/v1/auth/me', {
        name: 'Updated Test User',
        phone: '9999999999'
      }, {
        Authorization: `Bearer ${signinToken}`
      });
      if (res.status === 200 && res.body.name === 'Updated Test User') {
        console.log('✅ Profile updated successfully\n');
        testsPassed++;
      } else {
        console.log('❌ Profile update failed:', res.body?.error || 'Unknown error\n');
        testsFailed++;
      }
    }
  } catch (err) {
    console.log('❌ Profile update error:', err.message, '\n');
    testsFailed++;
  }

  // Test 6: Add Address
  console.log('Test 6: Add User Address');
  try {
    if (!signinToken) {
      console.log('⏭️ Skipped: No signin token\n');
      testsFailed++;
    } else {
      const res = await makeRequest('POST', '/api/v1/auth/addresses', {
        type: 'shipping',
        name: 'Home Address',
        phone: '9999999999',
        street: '123 Main Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        zipCode: '400001',
        country: 'India',
        isDefault: true
      }, {
        Authorization: `Bearer ${signinToken}`
      });
      if (res.status === 201 || (res.status === 200 && res.body.addresses)) {
        console.log('✅ Address added successfully\n');
        testsPassed++;
      } else {
        console.log('❌ Address add failed:', res.body?.error || 'Unknown error\n');
        testsFailed++;
      }
    }
  } catch (err) {
    console.log('❌ Address add error:', err.message, '\n');
    testsFailed++;
  }

  // Test 7: Get Addresses
  console.log('Test 7: Get User Addresses');
  try {
    if (!signinToken) {
      console.log('⏭️ Skipped: No signin token\n');
      testsFailed++;
    } else {
      const res = await makeRequest('GET', '/api/v1/auth/addresses', null, {
        Authorization: `Bearer ${signinToken}`
      });
      if (res.status === 200 && Array.isArray(res.body.addresses)) {
        console.log('✅ Addresses retrieved successfully (count:', res.body.addresses.length, ')\n');
        testsPassed++;
      } else {
        console.log('❌ Addresses retrieval failed\n');
        testsFailed++;
      }
    }
  } catch (err) {
    console.log('❌ Addresses retrieval error:', err.message, '\n');
    testsFailed++;
  }

  // Test 8: Get Cart
  console.log('Test 8: Get User Cart');
  try {
    if (!signinToken) {
      console.log('⏭️ Skipped: No signin token\n');
      testsFailed++;
    } else {
      const res = await makeRequest('GET', '/api/v1/cart', null, {
        Authorization: `Bearer ${signinToken}`
      });
      if (res.status === 200) {
        console.log('✅ Cart retrieved successfully\n');
        testsPassed++;
      } else {
        console.log('❌ Cart retrieval failed\n');
        testsFailed++;
      }
    }
  } catch (err) {
    console.log('❌ Cart retrieval error:', err.message, '\n');
    testsFailed++;
  }

  // Test 9: Get Orders (Empty initially)
  console.log('Test 9: Get User Orders');
  try {
    if (!signinToken) {
      console.log('⏭️ Skipped: No signin token\n');
      testsFailed++;
    } else {
      const res = await makeRequest('GET', '/api/v1/orders', null, {
        Authorization: `Bearer ${signinToken}`
      });
      if (res.status === 200 && Array.isArray(res.body.orders)) {
        console.log('✅ Orders retrieved successfully (count:', res.body.orders.length, ')\n');
        testsPassed++;
      } else {
        console.log('❌ Orders retrieval failed\n');
        testsFailed++;
      }
    }
  } catch (err) {
    console.log('❌ Orders retrieval error:', err.message, '\n');
    testsFailed++;
  }

  // Test 10: Get Wishlist
  console.log('Test 10: Get User Wishlist');
  try {
    if (!signinToken) {
      console.log('⏭️ Skipped: No signin token\n');
      testsFailed++;
    } else {
      const res = await makeRequest('GET', '/api/v1/wishlist', null, {
        Authorization: `Bearer ${signinToken}`
      });
      if (res.status === 200) {
        console.log('✅ Wishlist retrieved successfully\n');
        testsPassed++;
      } else {
        console.log('❌ Wishlist retrieval failed\n');
        testsFailed++;
      }
    }
  } catch (err) {
    console.log('❌ Wishlist retrieval error:', err.message, '\n');
    testsFailed++;
  }

  // Test 11: Get Products (for cart/order tests)
  console.log('Test 11: Get Products List');
  try {
    const res = await makeRequest('GET', '/api/v1/products?limit=5');
    if (res.status === 200 && Array.isArray(res.body.products) && res.body.products.length > 0) {
      console.log('✅ Products retrieved successfully (count:', res.body.products.length, ')\n');
      testsPassed++;
    } else {
      console.log('❌ Products retrieval failed\n');
      testsFailed++;
    }
  } catch (err) {
    console.log('❌ Products retrieval error:', err.message, '\n');
    testsFailed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Test Summary: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('='.repeat(50) + '\n');

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
