// Talks to the Node/Postgres server.
let token = (() => { try { return sessionStorage.getItem('nv_token'); } catch { return null; } })();
const save = t => { token = t; try { t ? sessionStorage.setItem('nv_token', t) : sessionStorage.removeItem('nv_token'); try { localStorage.removeItem('nv_token'); } catch {}; } catch { /* private mode */ } };

async function req(method, path, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  if (res.status === 401 && path.startsWith('/api')) { save(null); location.hash = '#/login'; }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export const realApi = {
  mode: 'real',
  isLoggedIn: () => !!token,
  async login(email, password) { const r = await req('POST', '/auth/login', { email, password }); save(r.token); return r.user; },
  async setup(body) { const r = await req('POST', '/auth/setup', body); save(r.token); return r.user; },
  logout: () => save(null),
  get: p => req('GET', p),
  post: (p, b) => req('POST', p, b),
  put: (p, b) => req('PUT', p, b),
  patch: (p, b) => req('PATCH', p, b),
  del: p => req('DELETE', p),
  media: url => url,
  shareUrl: token => `${location.origin}/s/${token}`,
};
