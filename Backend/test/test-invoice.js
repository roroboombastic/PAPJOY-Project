// Invoice functionality test
const http = require('http');

const API_BASE_URL = 'http://localhost:3000/api/v1';

async function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: `/api/v1${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: data ? JSON.parse(data) : null,
            headers: res.headers
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            body: data,
            headers: res.headers
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testInvoiceFlow() {
  console.log('🧪 Starting Invoice Functionality Tests\n');
  
  let testsPassed = 0;
  let testsFailed = 0;
  let signinToken = null;
  let orderId = null;

  // Test 1: Signup
  console.log('Test 1: User Signup');
  try {
    const email = `test_invoice_${Date.now()}@example.com`;
    const res = await makeRequest('POST', '/auth/register', {
      email,
      password: 'password123',
      name: 'Test User',
      phone: '+919876543210'
    });

    if (res.statusCode === 201 && res.body?.accessToken) {
      signinToken = res.body.accessToken;
      console.log('✅ Signup successful\n');
      testsPassed++;
    } else {
      console.log('❌ Signup failed\n');
      testsFailed++;
      return;
    }
  } catch (error) {
    console.log(`❌ Signup error: ${error.message}\n`);
    testsFailed++;
    return;
  }

  // Test 2: Create Order with payment
  console.log('Test 2: Create Order with Razorpay Verification');
  try {
    const products = [
      {
        productId: '6a201f0c1234567890abcdef',
        name: 'Premium Shoe',
        quantity: 2,
        price: 5000
      }
    ];

    const res = await makeRequest('POST', '/verify-payment', {
      paymentId: 'pay_' + Date.now(),
      orderId: 'ord_' + Date.now(),
      signature: require('crypto').createHmac('sha256', 'razorpay_test_key').update(`ord_${Date.now()}|pay_${Date.now()}`).digest('hex'),
      products,
      amount: 10000,
      deliveryInfo: {
        address: 'Test Address',
        city: 'Delhi',
        state: 'Delhi',
        zipCode: '110001'
      }
    }, {
      'Authorization': `Bearer ${signinToken}`
    });

    if (res.statusCode === 200 && res.body?.order?._id) {
      orderId = res.body.order._id;
      console.log(`✅ Order created with ID: ${orderId}\n`);
      testsPassed++;
    } else {
      console.log(`❌ Order creation failed: ${res.statusCode}\n`);
      testsFailed++;
    }
  } catch (error) {
    console.log(`❌ Order creation error: ${error.message}\n`);
    testsFailed++;
  }

  // Test 3: Get Invoice
  if (orderId) {
    console.log('Test 3: Get Invoice Details');
    try {
      const res = await makeRequest('GET', `/invoices/${orderId}`, null, {
        'Authorization': `Bearer ${signinToken}`
      });

      if (res.statusCode === 200 && res.body?.invoiceNumber) {
        console.log(`✅ Invoice retrieved: ${res.body.invoiceNumber}\n`);
        testsPassed++;
      } else {
        console.log(`❌ Invoice retrieval failed: ${res.statusCode}\n`);
        testsFailed++;
      }
    } catch (error) {
      console.log(`❌ Invoice retrieval error: ${error.message}\n`);
      testsFailed++;
    }
  }

  // Test 4: Download Invoice PDF
  if (orderId) {
    console.log('Test 4: Download Invoice PDF');
    try {
      const res = await makeRequest('GET', `/invoices/${orderId}/download`, null, {
        'Authorization': `Bearer ${signinToken}`
      });

      if (res.statusCode === 200 && res.headers['content-type'] === 'application/pdf') {
        console.log('✅ Invoice PDF downloaded successfully\n');
        testsPassed++;
      } else {
        console.log(`❌ Invoice PDF download failed: ${res.statusCode}\n`);
        testsFailed++;
      }
    } catch (error) {
      console.log(`❌ Invoice PDF download error: ${error.message}\n`);
      testsFailed++;
    }
  }

  // Test 5: List User Invoices
  console.log('Test 5: List User Invoices');
  try {
    const res = await makeRequest('GET', '/invoices', null, {
      'Authorization': `Bearer ${signinToken}`
    });

    if (res.statusCode === 200 && Array.isArray(res.body?.invoices)) {
      console.log(`✅ User invoices listed: ${res.body.invoices.length} invoice(s)\n`);
      testsPassed++;
    } else {
      console.log(`❌ Invoice listing failed: ${res.statusCode}\n`);
      testsFailed++;
    }
  } catch (error) {
    console.log(`❌ Invoice listing error: ${error.message}\n`);
    testsFailed++;
  }

  // Summary
  console.log('==================================================');
  console.log(`📊 Invoice Test Summary: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('==================================================\n');
}

testInvoiceFlow().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
