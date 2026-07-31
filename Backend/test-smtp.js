// Run: node test-smtp.js
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const nodemailer = require('nodemailer');

const config = {
  host: process.env.SMTP_HOST || '(not set)',
  port: Number(process.env.SMTP_PORT) || 587,
  user: process.env.SMTP_USER || '(not set)',
  pass: process.env.SMTP_PASS ? '***present***' : '(not set)',
  fromName: process.env.SMTP_FROM_NAME || 'PAP-JOY',
  fromAddress: process.env.SMTP_FROM_ADDRESS || process.env.CUSTOMER_SUPPORT || 'papp.joyy@gmail.com',
};

console.log('=== SMTP Config Check ===');
console.log('SMTP_HOST:', config.host);
console.log('SMTP_PORT:', config.port);
console.log('SMTP_USER:', config.user);
console.log('SMTP_PASS:', config.pass);
console.log('SMTP_FROM_NAME:', config.fromName);
console.log('SMTP_FROM_ADDRESS:', config.fromAddress);

if (!config.host || !config.user || config.pass === '(not set)') {
  console.error('\n❌ SMTP not fully configured. Check your .env file.');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: config.host,
  port: config.port,
  secure: config.port === 465,
  auth: { user: config.user, pass: process.env.SMTP_PASS },
  requireTLS: config.port !== 465,
});

transporter.verify()
  .then(() => {
    console.log('\n✅ SMTP connection verified successfully!\n');
    return transporter.sendMail({
      from: `"${config.fromName}" <${config.fromAddress}>`,
      to: config.user,
      subject: 'PAP-JOY SMTP Test',
      html: '<h2>SMTP Test</h2><p>If you receive this, email is working correctly.</p>',
    });
  })
  .then(info => {
    console.log('✅ Test email sent! Message ID:', info.messageId);
  })
  .catch(err => {
    console.error('\n❌ SMTP Error:', err.message);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure you are using an App Password (not your regular Gmail password)');
    console.error('2. Make sure 2-Factor Authentication is enabled on your Google account');
    console.error('3. Check that SMTP_PORT is correct (587 for TLS, 465 for SSL)');
    console.error('4. If using Gmail, check https://myaccount.google.com/apppasswords to generate a new app password');
  });
