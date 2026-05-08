import { URL } from 'node:url';

const ADDRESSES = Object.freeze({
  donations: Object.freeze({
    callback: 'https://blink.sv/lnurlp/dhalsim/callback',
    minSendable: 1000,
    maxSendable: 100000000000,
    metadata: JSON.stringify([
      ['text/plain', 'Payment to donations@getappweaver.com'],
      ['text/identifier', 'donations@getappweaver.com'],
    ]),
    commentAllowed: 280,
    tag: 'payRequest',
    allowsNostr: true,
    nostrPubkey:
      '8fe53b37518e3dbe9bab26d912292001d8b882de9456b7b08b615f912dc8bf4a',
  }),
});

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
  response.setHeader('Cache-Control', 'public, max-age=300');
}

function sendJson(response, statusCode, body) {
  setCommonHeaders(response);
  response.statusCode = statusCode;
  response.end(JSON.stringify(body, null, 2));
}

function requestedAddressName(request) {
  const url = new URL(
    request.url || '/',
    `https://${request.headers.host || 'getappweaver.com'}`,
  );

  const queryName = url.searchParams.get('name');

  if (queryName !== null) {
    return queryName;
  }

  const pathMatch = url.pathname.match(/\/\.well-known\/lnurlp\/([^/]+)$/u);

  return pathMatch ? decodeURIComponent(pathMatch[1]) : '';
}

export default function handler(request, response) {
  if (request.method === 'OPTIONS') {
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      response.setHeader(key, value);
    }

    response.statusCode = 204;
    response.end();

    return;
  }

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET, OPTIONS');
    sendJson(response, 405, { status: 'ERROR', reason: 'Method not allowed' });

    return;
  }

  const name = requestedAddressName(request);
  const address = ADDRESSES[name];

  if (!address) {
    sendJson(response, 404, {
      status: 'ERROR',
      reason: 'Lightning address not found',
    });

    return;
  }

  sendJson(response, 200, address);
}
