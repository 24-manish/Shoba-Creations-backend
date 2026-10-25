import { app } from '../../src/app.js';

/**
 * A cookie-aware HTTP client for the API under test.
 *
 * Two behaviours are load-bearing and were both learned from failures:
 *
 *  1. The CSRF token is read from the cookie jar immediately before every
 *     non-GET request, never cached. The server rotates `sc_csrf` on every login
 *     and every refresh, so a captured token produces a 403 that looks like an
 *     authorisation bug rather than a stale token.
 *  2. Body assertions are gated behind ok(), which asserts the status first. If a
 *     request fails with a 4xx, every body assertion downstream is skipped, so
 *     one real failure reports as one failure instead of a cascade of
 *     misleading ones.
 */
export const createClient = (baseUrl) => {
  const jar = new Map();

  // Mirrors the exemption list in src/app.js.
  const csrfExempt = new Set(['/api/auth/login', '/api/auth/register']);
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

  const storeCookies = (res) => {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();

      if (value === '' || /expires=thu, 01 jan 1970/i.test(raw)) {
        jar.delete(name);
      } else {
        jar.set(name, value);
      }
    }
  };

  const request = async (method, path, body, options = {}) => {
    const headers = { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    const isMultipart = options.multipart === true;
    const sendCsrf = !csrfExempt.has(path.split('?')[0]) && !safeMethods.has(method);

    // options.csrf forces a header value that deliberately disagrees with the
    // cookie, which is how the double-submit rejection path is exercised.
    if (sendCsrf && (options.csrf !== undefined || jar.has('sc_csrf'))) {
      headers['x-csrf-token'] = options.csrf ?? jar.get('sc_csrf');
    }

    if (body !== undefined && !isMultipart) {
      headers['content-type'] = 'application/json';
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: isMultipart ? body : body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000)
    });

    storeCookies(res);

    const text = await res.text();
    let json = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* response was not JSON */
    }

    return { status: res.status, json, text, data: json?.data, headers: res.headers };
  };

  const client = {
    jar,
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),
    put: (path, body) => request('PUT', path, body),
    delete: (path) => request('DELETE', path),
    upload: (path, form) => request('POST', path, form, { multipart: true }),
    raw: request,
    clearCookies: () => jar.clear(),

    /** Asserts the status, returning a boolean the caller can gate on. */
    ok(res, expected, label) {
      const pass = Array.isArray(expected) ? expected.includes(res.status) : res.status === expected;
      if (!pass) {
        console.error(`      ${label}: expected ${expected}, got ${res.status} :: ${res.text.slice(0, 300)}`);
      }
      return pass;
    },

    /** Signs a user in and returns the session payload. */
    async signIn(email, password, guestState) {
      const res = await request('POST', '/api/auth/login', { email, password, ...(guestState ? { guestState } : {}) });
      if (!client.ok(res, 200, `sign in as ${email}`)) {
        throw new Error(`Could not sign in as ${email}: ${res.status} ${res.text.slice(0, 200)}`);
      }
      return res.data;
    }
  };

  return client;
};

/** Starts the API on an ephemeral port so suites never contend for 3000. */
export const startTestServer = async () => {
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    client: createClient(baseUrl),
    close: () => new Promise((resolve) => server.close(resolve))
  };
};
