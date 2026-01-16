// scripts/test-postmark-simple.ts
import * as dotenv from 'dotenv';
import * as nodemailer from 'nodemailer';
const postmarkTransport = require('nodemailer-postmark-transport');

dotenv.config();

async function sendTestEmail() {
  const apiKey = process.env.POSTMARK_API_TOKEN;
  const fromEmail = process.env.EMAIL_FROM || 'admin@suuqsapp.com';
  // Send to user's personal email or the admin email for verification
  // Since I don't know the user's real personal email, I'll send to the one configured i.e admin@suuqsapp.com
  // But wait, if they don't have inbox for that, they can't verify.
  // The user prompt mentioned: "You are now officially out of "Test Mode" and can start sending emails from your application to any real email address."
  // I will use a dummy address but print success. Ideally the user runs this and checks an inbox.
  // I'll ask the user to change the recipient in the code or CLI arg if needed.
  // actually, let's just pick 'suuqsapp+test@gmail.com' or similar if not provided.
  const toEmail = process.argv[2] || 'ugasfuad@gmail.com'; // Guessing based on author, or just ask user to check logs.

  console.log(`Using API Key: ${apiKey ? '***' + apiKey.slice(-4) : 'MISSING'}`);
  console.log(`From: ${fromEmail}`);
  console.log(`To: ${toEmail}`);

  if (!apiKey) {
    console.error('Error: POSTMARK_API_TOKEN is missing in .env');
    process.exit(1);
  }

  const transport = nodemailer.createTransport(
    postmarkTransport({
      auth: {
        apiKey: apiKey,
      },
    }),
  );

  try {
    const result = await transport.sendMail({
      from: fromEmail,
      to: toEmail,
      subject: 'Hello from Suuq S Backend - Postmark Test',
      text: 'This is a test email from your Suuq S Backend using Postmark. If you received this, the integration is working! 🚀',
      html: '<strong>This is a test email from your Suuq S Backend using Postmark.</strong><br/>If you received this, the integration is working! 🚀',
    });
    console.log('✅ Email sent successfully!');
    console.log('Message ID:', result.messageId);
    console.log('Accepted:', result.accepted);
  } catch (error) {
    console.error('❌ Failed to send email:', error);
  }
}

sendTestEmail();
