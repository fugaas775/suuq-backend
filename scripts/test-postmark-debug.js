
const nodemailer = require('nodemailer');
const postmarkTransport = require('nodemailer-postmark-transport');

async function testEmail() {
  const apiKey = '39f9061c-007e-4fdb-9a55-163a1245aade';
  console.log('Testing Postmark with Key:', apiKey);

  const transporter = nodemailer.createTransport(
    postmarkTransport({
      auth: { apiKey: apiKey },
    })
  );

  try {
    const result = await transporter.sendMail({
      from: '"Suuq Admin" <admin@suuqsapp.com>',
      to: 'suuqsapp@gmail.com',
      subject: 'Test Email form Debugger',
      text: 'This is a test email to verify delivery.',
      html: '<h1>This is a test email</h1><p>to verify delivery.</p>',
    });
    console.log('Success:', result);
  } catch (err) {
    console.error('Error:', err);
  }
}

testEmail();
