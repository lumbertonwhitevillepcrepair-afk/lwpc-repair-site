// netlify/functions/submission-created.js
//
// Netlify calls this automatically after it records a device-intake submission.
// Netlify Forms still stores the submission and sends the existing email --
// this only adds an instant push notification to Billy's phone via Pushover.
//
// No dependencies: Node's built-in fetch is used, so there is nothing to bundle.
// Always returns 200, because a push failure must never fail a customer's
// submission. The email remains the backstop.

exports.handler = async (event) => {
  try {
    const { payload } = JSON.parse(event.body || '{}');

    if (!payload || payload.form_name !== 'device-intake') {
      return { statusCode: 200, body: 'ignored' };
    }

    const { PUSHOVER_TOKEN, PUSHOVER_USER } = process.env;
    if (!PUSHOVER_TOKEN || !PUSHOVER_USER) {
      console.log('Pushover not configured - skipping push.');
      return { statusCode: 200, body: 'push skipped' };
    }

    const d = payload.data || {};
    const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

    const name = clean(d.name) || 'No name given';
    const phone = clean(d.phone);
    const device = [clean(d.deviceType), clean(d.brandModel)].filter(Boolean).join(' ');

    const lines = [
      device && `Device: ${device}`,
      clean(d.issue) && `Issue: ${clean(d.issue)}`,
      clean(d.duration) && `Going on: ${clean(d.duration)}`,
      clean(d.previousWork) && `Prior work: ${clean(d.previousWork)}`,
      phone && `Phone: ${phone}`,
      clean(d.email) && `Email: ${clean(d.email)}`,
    ].filter(Boolean);

    const body = new URLSearchParams({
      token: PUSHOVER_TOKEN,
      user: PUSHOVER_USER,
      title: `New intake: ${name}`,
      message: lines.join('\n') || 'Submitted with no details.',
      priority: '1',
      sound: 'persistent',
    });

    // Makes the notification tappable to dial the customer straight back.
    if (phone) {
      body.set('url', `tel:${phone.replace(/[^\d+]/g, '')}`);
      body.set('url_title', `Call ${name}`);
    }

    const res = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      console.error('Pushover rejected the request:', res.status, await res.text());
      return { statusCode: 200, body: 'push failed' };
    }

    console.log('Intake push sent.');
    return { statusCode: 200, body: 'push sent' };
  } catch (err) {
    console.error('Push notification error:', err);
    return { statusCode: 200, body: 'push error' };
  }
};
