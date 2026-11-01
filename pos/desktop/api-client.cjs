function apiOrigin(config) {
  const url = new URL(config.apiUrl || config.url || 'https://api.8sianracha.com');
  if (
    !['/', '/pos/'].includes(url.pathname) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    )
  )
    throw new Error('ตั้งค่า apiUrl เป็น HTTPS origin ของ backend');
  return url.origin;
}

// Session stays in the main process, never exposed to the web page or saved on disk.
function createApiClient(origin, fetchImpl = fetch) {
  let cookie = '';
  return async (route, body, method = 'POST') => {
    if (
      typeof route !== 'string' ||
      !/^[a-zA-Z0-9/-]+(?:\?date=\d{4}-\d{2}-\d{2})?$/.test(route) ||
      route.includes('//') ||
      !['GET', 'POST'].includes(method)
    )
      throw new Error('คำขอ POS ไม่ถูกต้อง');
    const response = await fetchImpl(`${origin}/api/pos/${route}`, {
      method: body === undefined ? 'GET' : method,
      redirect: 'error',
      headers: {
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    for (const value of response.headers.getSetCookie()) {
      if (/^(?:__Host-)?pos_session=/.test(value)) cookie = value.split(';')[0];
    }
    if (response.status === 401 || (route === 'logout' && response.ok)) cookie = '';
    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  };
}
module.exports = { apiOrigin, createApiClient };
