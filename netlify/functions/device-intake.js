// netlify/functions/device-intake.js
// Handles device-intake form submissions: sends email + SMS notification

const nodemailer = require('nodemailer');
const twilio = require('twilio');
const querystring = require('querystring');

// Initialize Twilio client (if SMS credentials are available)
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// Initialize email transporter
const emailTransporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

exports.handler = async (event) => {
  try {
    // Only handle POST requests
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    // Parse form data
    const data = querystring.parse(event.body);
    const { name, phone, email, deviceType, brandModel, issue, duration, previousWork } = data;

    // Validate required fields
    if (!name || !phone || !deviceType || !issue) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }

    // Build the message content
    const formattedMessage = `New Device Intake Submission

Customer Info:
- Name: ${name}
- Phone: ${phone}
- Email: ${email || 'Not provided'}

Device Details:
- Type: ${deviceType}
- Brand/Model: ${brandModel || 'Not specified'}
- Issue: ${issue}
- Duration: ${duration || 'Not specified'}
- Previous Work: ${previousWork || 'Not specified'}

---
Submitted: ${new Date().toLocaleString()}`;

    // Send email notification
    if (process.env.EMAIL_RECIPIENT) {
      try {
        await emailTransporter.sendMail({
          from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
          to: process.env.EMAIL_RECIPIENT,
          subject: `New Device Intake: ${name}`,
          text: formattedMessage,
          replyTo: email || phone,
        });
      } catch (emailError) {
        console.error('Email send error:', emailError);
        // Continue to SMS even if email fails
      }
    }

    // Send SMS notification
    if (twilioClient && process.env.SHOP_PHONE_NUMBER && process.env.TWILIO_PHONE_NUMBER) {
      try {
        const smsMessage = `New intake from ${name}. Issue: ${issue}. Device: ${deviceType}${brandModel ? ' (' + brandModel + ')' : ''}. Call: ${phone}`;

        await twilioClient.messages.create({
          body: smsMessage.substring(0, 160), // SMS length limit
          from: process.env.TWILIO_PHONE_NUMBER,
          to: process.env.SHOP_PHONE_NUMBER,
        });
      } catch (smsError) {
        console.error('SMS send error:', smsError);
        // Continue even if SMS fails
      }
    }

    // Redirect to success page or return success response
    return {
      statusCode: 303,
      headers: { 'Location': '/?success=true' },
      body: '',
    };
  } catch (error) {
    console.error('Device intake error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to process submission', details: error.message }),
    };
  }
};
