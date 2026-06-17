const CORS_HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
});

function setCommonHeaders(response) {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.setHeader(key, value);
  }

  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
}

function sendJson(response, statusCode, body) {
  setCommonHeaders(response);
  response.statusCode = statusCode;
  response.end(JSON.stringify(body, null, 2));
}

function testPaymentRequest({ amount, comment, nostr }) {
  const payload = encodeURIComponent(JSON.stringify({ amount, comment, nostr }))
    .replace(/%/gu, '')
    .slice(0, 220);

  return `lnbc${amount}n1appweavertest${payload}`.toLowerCase();
}

export default function handler(request, response) {
  if (request.method === 'OPTIONS') {
    setCommonHeaders(response);
    response.statusCode = 204;
    response.end();

    return;
  }

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET, OPTIONS');
    sendJson(response, 405, { status: 'ERROR', reason: 'Method not allowed' });

    return;
  }

  const requestUrl = globalThis.URL;
  const url = new requestUrl(
    request.url || '/',
    `https://${request.headers.host || 'getappweaver.com'}`,
  );
  const amount = url.searchParams.get('amount');
  const nostr = url.searchParams.get('nostr');
  const comment = url.searchParams.get('comment') ?? '';

  if (!amount || !/^\d+$/u.test(amount)) {
    sendJson(response, 400, {
      status: 'ERROR',
      reason: 'Missing or invalid amount.',
    });

    return;
  }

  if (!nostr) {
    sendJson(response, 400, {
      status: 'ERROR',
      reason: 'Missing zap request.',
    });

    return;
  }

  sendJson(response, 200, {
    pr: testPaymentRequest({ amount, comment, nostr }),
    routes: [],
  });
}
