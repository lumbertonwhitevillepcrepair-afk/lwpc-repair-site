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

    // Two pages have posted to this same Netlify form under two different
    // field spellings: index.html used kebab-case (device-type, problem),
    // device-intake.html used camelCase (deviceType, issue). This function
    // only knew the camelCase names, so every submission from the home page
    // arrived here with the device and the customer description of the
    // problem sitting in keys nobody read -- and because a missing key is
    // just undefined, the notification came through looking fine, only
    // shorter. Nothing logged an error. Accept both spellings.
    const pick = (...keys) => {
      for (const k of keys) {
        const v = clean(d[k]);
        if (v) return v;
      }
      return '';
    };

    const name = pick('name') || 'No name given';
    const phone = pick('phone');
    const email = pick('email');
    const deviceType = pick('deviceType', 'device-type');
    const brandModel = pick('brandModel', 'brand-model');
    const issue = pick('issue', 'problem');
    const duration = pick('duration');
    const previousWork = pick('previousWork', 'previous-work');

    const device = [deviceType, brandModel].filter(Boolean).join(' ');

    // Anything the form sends that this function does not recognise gets
    // appended rather than dropped. That is the actual lesson from the bug
    // above: a notification that quietly omits what it does not understand
    // is indistinguishable from a customer who typed less. An ugly extra
    // line is a much cheaper failure than a missing one.
    const KNOWN = new Set([
      'name', 'phone', 'email',
      'deviceType', 'device-type',
      'brandModel', 'brand-model',
      'issue', 'problem',
      'duration',
      'previousWork', 'previous-work',
      'form-name', 'bot-field',
    ]);
    const extras = Object.keys(d)
      .filter((k) => !KNOWN.has(k))
      .map((k) => {
        const v = clean(d[k]);
        return v ? `${k}: ${v}` : '';
      })
      .filter(Boolean);

    const lines = [
      device && `Device: ${device}`,
      issue && `Issue: ${issue}`,
      duration && `Going on: ${duration}`,
      previousWork && `Prior work: ${previousWork}`,
      phone && `Phone: ${phone}`,
      email && `Email: ${email}`,
      ...extras,
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
