const doReq = async (method, path, body, cookie) => {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch('http://localhost:8000' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  console.log(method, path, res.status);
  console.log(text);
  return { status: res.status, headers: res.headers, text };
};

(async () => {
  const login = await doReq('POST', '/api/v1/auth/login', {
    email: 'admin@spaceezy.com',
    password: 'password123'
  });
  const setCookie = login.headers.get('set-cookie');
  const cookie = setCookie ? setCookie.split(';')[0] : '';
  await doReq('GET', '/api/v1/users', undefined, cookie);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
