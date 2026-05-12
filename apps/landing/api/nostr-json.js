import { URL } from 'node:url';

const NAMES = Object.freeze({
  _: '721e69c3f3f4e094a90ac00c3a4900c36271ee63aeebe67fbeedc112c31fb298',
  "dhalsim": "6e64b83c1f674fb00a5f19816c297b6414bf67f015894e04dd4c657e94102ee8"
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
    sendJson(response, 405, { error: 'Method not allowed' });

    return;
  }

  const url = new URL(
    request.url || '/',
    `https://${request.headers.host || 'getappweaver.com'}`,
  );
  const requestedName = url.searchParams.get('name');
  const names =
    requestedName === null
      ? NAMES
      : Object.prototype.hasOwnProperty.call(NAMES, requestedName)
        ? { [requestedName]: NAMES[requestedName] }
        : {};

  sendJson(response, 200, { names });
}
