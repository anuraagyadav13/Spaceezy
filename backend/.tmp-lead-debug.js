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

  await doReq('POST', '/api/v1/leads', {
    name: 'E2E Test Lead 20261002',
    phone: '+91 90000 00001',
    email: 'e2e-lead-20261002-001@spaceezy.test',
    project: 'Alpha Residency',
    budget: '₹1.5 Cr',
    source: 'Website',
    assignedToId: '00000000-0000-0000-0000-000000000000'
  }, cookie);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
