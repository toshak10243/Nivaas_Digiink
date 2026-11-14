// Talks to the Node/Postgres server.
let token = (() => {
  try {
    return localStorage.getItem('nv_token') || sessionStorage.getItem('nv_token');
  } catch {
    return null;
  }
})();

let refreshToken = (() => {
  try {
    return localStorage.getItem('nv_refresh_token') || sessionStorage.getItem('nv_refresh_token');
  } catch {
    return null;
  }
})();

const save = (t, r) => {
  token = t;
  refreshToken = r || refreshToken;
  try {
    if (t) {
      localStorage.setItem('nv_token', t);
      sessionStorage.setItem('nv_token', t);
      if (r) {
        localStorage.setItem('nv_refresh_token', r);
        sessionStorage.setItem('nv_refresh_token', r);
      }
    } else {
      localStorage.removeItem('nv_token');
      sessionStorage.removeItem('nv_token');
      localStorage.removeItem('nv_refresh_token');
      sessionStorage.removeItem('nv_refresh_token');
    }
  } catch {
    /* private mode */
  }
};

async function req(method, path, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  if (res.status === 401 && path.startsWith('/api')) {
    save(null);
    try {
      sessionStorage.setItem('nivaas_session_expired', 'Session expired. Please log in again.');
    } catch {}
    window.dispatchEvent(new CustomEvent('nivaas:session-expired', { detail: { message: 'Session expired. Please log in again.' } }));
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export const realApi = {
  mode: 'real',
  isLoggedIn: () => !!token,
  async login(email, password) {
    const r = await req('POST', '/auth/login', { email, password });
    save(r.token, r.refreshToken);
    return r.user;
  },
  async setup(body) {
    const r = await req('POST', '/auth/setup', body);
    save(r.token, r.refreshToken);
    return r.user;
  },
  logout: () => save(null),
  get: p => req('GET', p),
  post: (p, b) => req('POST', p, b),
  put: (p, b) => req('PUT', p, b),
  patch: (p, b) => req('PATCH', p, b),
  del: p => req('DELETE', p),
  media: url => url,
  shareUrl: token => `${location.origin}/s/${token}`,
};
