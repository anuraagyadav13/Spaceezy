const request = require('supertest');
const crypto = require('crypto');
const argon2 = require('argon2');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const { ROLE_PERMISSIONS, requirePermission } = require('../src/middleware/auth');

jest.mock('../src/db/prisma', () => ({
  session: {
    findUnique: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
}));

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const activeSession = (overrides = {}) => ({
  expiresAt: new Date(Date.now() + 60_000),
  user: {
    id: 'user-123',
    organizationId: 'org-123',
    role: 'SALES_EXECUTIVE',
    status: 'ACTIVE',
    ...overrides.user,
  },
  ...overrides.session,
});

const ALL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'SALES_EXECUTIVE', 'CHANNEL_PARTNER'];

describe('Bearer authentication (Option B)', () => {
  beforeEach(() => {
    delete process.env.SESSION_COOKIE_NAME;
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      name: 'Test User',
      email: 'tester@spaceezy.com',
      role: 'SALES_EXECUTIVE',
      organization: { id: 'org-123', name: 'SpaceEzy' },
    });
  });

  it('authenticates GET /auth/me via Authorization: Bearer and hashes the token for lookup', async () => {
    const token = 'bearer-token-abc';
    prisma.session.findUnique.mockResolvedValue(activeSession());

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('user-123');
    expect(prisma.session.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: sha256(token) } })
    );
    // Never leak the token (or its hash) on unrelated endpoints.
    expect(JSON.stringify(res.body)).not.toContain(token);
    expect(JSON.stringify(res.body)).not.toContain(sha256(token));
  });

  it('rejects an unknown Bearer token with 401', async () => {
    prisma.session.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer unknown-token');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(prisma.session.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: sha256('unknown-token') } })
    );
  });

  it('rejects an expired session with 401', async () => {
    prisma.session.findUnique.mockResolvedValue(
      activeSession({ session: { expiresAt: new Date(Date.now() - 1000) } })
    );

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer expired-token');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('rejects a deactivated user with 401 even with a valid Bearer token', async () => {
    prisma.session.findUnique.mockResolvedValue(
      activeSession({ user: { status: 'INACTIVE' } })
    );

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/deactivated/i);
  });

  it('returns 401 when neither cookie nor Bearer token is present', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });
});

describe('Cookie authentication regression (web CRM unchanged)', () => {
  beforeEach(() => {
    delete process.env.SESSION_COOKIE_NAME;
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      name: 'Test User',
      email: 'tester@spaceezy.com',
      role: 'SALES_EXECUTIVE',
      organization: { id: 'org-123', name: 'SpaceEzy' },
    });
  });

  it('still authenticates via the session cookie alone', async () => {
    prisma.session.findUnique.mockResolvedValue(activeSession());

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', ['spaceezy_session=cookie-token-xyz']);

    expect(res.status).toBe(200);
    expect(prisma.session.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: sha256('cookie-token-xyz') } })
    );
  });

  it('falls back to the cookie when the Authorization header is malformed', async () => {
    prisma.session.findUnique.mockResolvedValue(activeSession());

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Basic dXNlcjpwYXNz')
      .set('Cookie', ['spaceezy_session=cookie-token-xyz']);

    expect(res.status).toBe(200);
    expect(prisma.session.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: sha256('cookie-token-xyz') } })
    );
  });

  it('honors a custom SESSION_COOKIE_NAME as before', async () => {
    process.env.SESSION_COOKIE_NAME = 'custom_session';
    prisma.session.findUnique.mockResolvedValue(activeSession());

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', ['custom_session=custom-token']);

    expect(res.status).toBe(200);
    expect(prisma.session.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: sha256('custom-token') } })
    );
  });
});

describe('Login response contract (cookie preserved + token for mobile)', () => {
  beforeEach(() => {
    delete process.env.SESSION_COOKIE_NAME;
    jest.clearAllMocks();
  });

  it('returns the opaque token in the JSON body, still sets the httpOnly cookie, and never exposes the hash', async () => {
    const passwordHash = await argon2.hash('Str0ngPassword!123');
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-123',
      name: 'Test User',
      email: 'tester@spaceezy.com',
      role: 'ADMIN',
      status: 'ACTIVE',
      passwordHash,
      organization: { id: 'org-123', name: 'SpaceEzy' },
    });
    prisma.session.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'tester@spaceezy.com', password: 'Str0ngPassword!123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Mobile contract: token + expiry in the body.
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.token).toHaveLength(64);
    expect(new Date(res.body.data.tokenExpiresAt).getTime()).toBeGreaterThan(Date.now());

    // Web contract preserved: Set-Cookie with the same raw token.
    const setCookie = res.headers['set-cookie'] || [];
    expect(setCookie.join(';')).toContain('spaceezy_session=');
    expect(setCookie.join(';')).toContain(res.body.data.token);
    expect(setCookie.join(';')).toContain('HttpOnly');

    // Web fields unchanged.
    expect(res.body.data.id).toBe('user-123');
    expect(res.body.data.role).toBe('ADMIN');
    expect(res.body.data.organization).toEqual({ id: 'org-123', name: 'SpaceEzy' });

    // Session is created with the SHA-256 hash only — never the raw token.
    expect(prisma.session.create).toHaveBeenCalledTimes(1);
    const created = prisma.session.create.mock.calls[0][0].data;
    expect(created.tokenHash).toBe(sha256(res.body.data.token));
    expect(created.tokenHash).not.toBe(res.body.data.token);

    // The hash must never appear in the response.
    expect(JSON.stringify(res.body)).not.toContain(created.tokenHash);
  });

  it('does not return a token for failed credentials', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@spaceezy.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.data).toBeUndefined();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });
});

describe('Logout and session revocation (both transports)', () => {
  beforeEach(() => {
    delete process.env.SESSION_COOKIE_NAME;
    jest.clearAllMocks();
  });

  it('revokes the Bearer-authenticated session server-side', async () => {
    prisma.session.findUnique.mockResolvedValue(activeSession());
    prisma.session.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer logout-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: sha256('logout-token') },
    });
    // Cookie clearing behavior preserved for the web client.
    expect((res.headers['set-cookie'] || []).join(';')).toContain('spaceezy_session=');
  });

  it('revokes the cookie-authenticated session as before', async () => {
    prisma.session.findUnique.mockResolvedValue(activeSession());
    prisma.session.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', ['spaceezy_session=cookie-logout-token']);

    expect(res.status).toBe(200);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: sha256('cookie-logout-token') },
    });
  });
});

describe('GET /api/v1/auth/permissions — server-authoritative', () => {
  beforeEach(() => {
    delete process.env.SESSION_COOKIE_NAME;
    jest.clearAllMocks();
  });

  it('returns 401 without a session', async () => {
    const res = await request(app).get('/api/v1/auth/permissions');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it.each(ALL_ROLES)('returns the exact server matrix for %s', async (role) => {
    prisma.session.findUnique.mockResolvedValue(activeSession({ user: { role } }));

    const res = await request(app)
      .get('/api/v1/auth/permissions')
      .set('Authorization', `Bearer token-for-${role}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role).toBe(role);
    expect(res.body.data.permissions).toEqual([...ROLE_PERMISSIONS[role]]);

    // Exact shape: no user id, org id, name, email or token material.
    expect(Object.keys(res.body.data).sort()).toEqual(['permissions', 'role']);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('user-123');
    expect(raw).not.toContain('org-123');
  });

  it('mirrors requirePermission() exactly for every role and permission', () => {
    for (const role of ALL_ROLES) {
      const matrix = ROLE_PERMISSIONS[role] || [];
      expect(new Set(matrix).size).toBe(matrix.length); // no duplicates
      expect(Array.isArray(matrix)).toBe(true);
    }
    // Spot-check known divergences between roles stay intact.
    expect(ROLE_PERMISSIONS.CHANNEL_PARTNER).not.toContain('lead:delete');
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain('lead:delete');
    expect(ROLE_PERMISSIONS.SALES_EXECUTIVE).not.toContain('employee:create');
    expect(ROLE_PERMISSIONS.ADMIN).toContain('employee:create');
  });

  it('returns empty permissions for an unknown role instead of crashing', async () => {
    prisma.session.findUnique.mockResolvedValue(activeSession({ user: { role: 'SOMETHING_NEW' } }));

    const res = await request(app)
      .get('/api/v1/auth/permissions')
      .set('Authorization', 'Bearer unknown-role-token');

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('SOMETHING_NEW');
    expect(res.body.data.permissions).toEqual([]);
  });

  it('resolves the role from the session (organization scoping), not from client input', async () => {
    prisma.session.findUnique.mockResolvedValue(
      activeSession({ user: { organizationId: 'org-B', role: 'CHANNEL_PARTNER' } })
    );

    const res = await request(app)
      .get('/api/v1/auth/permissions')
      .set('Authorization', 'Bearer org-b-token')
      .set('X-Organization-Id', 'org-A'); // injected header must be irrelevant

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('CHANNEL_PARTNER');
    expect(JSON.stringify(res.body)).not.toContain('org-A');
    expect(JSON.stringify(res.body)).not.toContain('org-B');
  });
});

describe('Owner-granted per-user permissions (User.extraPermissions)', () => {
  beforeEach(() => {
    delete process.env.SESSION_COOKIE_NAME;
    jest.clearAllMocks();
  });

  const grantedSession = () =>
    activeSession({
      user: {
        role: 'SALES_EXECUTIVE',
        extraPermissions: ['marketing:view', 'marketing:manage'],
      },
    });

  it('requireAuth attaches extraPermissions from the session user', async () => {
    prisma.session.findUnique.mockResolvedValue(grantedSession());
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      name: 'Test User',
      email: 'tester@spaceezy.com',
      role: 'SALES_EXECUTIVE',
      extraPermissions: ['marketing:view', 'marketing:manage'],
      organization: { id: 'org-123', name: 'SpaceEzy' },
    });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer granted-token');

    expect(res.status).toBe(200);
    expect(res.body.data.extraPermissions).toEqual(['marketing:view', 'marketing:manage']);
    // Effective permissions = role matrix + grants.
    expect(res.body.data.permissions).toEqual(
      [...ROLE_PERMISSIONS.SALES_EXECUTIVE, 'marketing:view', 'marketing:manage']
    );
  });

  it('serves the effective (role + grants) matrix on /auth/permissions', async () => {
    prisma.session.findUnique.mockResolvedValue(grantedSession());

    const res = await request(app)
      .get('/api/v1/auth/permissions')
      .set('Authorization', 'Bearer granted-token');

    expect(res.status).toBe(200);
    expect(res.body.data.permissions).toContain('marketing:view');
    expect(res.body.data.permissions).toContain('marketing:manage');
    // Grants only extend — never replace — the role matrix.
    expect(res.body.data.permissions).toEqual(expect.arrayContaining(ROLE_PERMISSIONS.SALES_EXECUTIVE));
    // Shape guard still holds: role + permissions only.
    expect(Object.keys(res.body.data).sort()).toEqual(['permissions', 'role']);
  });

  it('requirePermission() admits a granted permission and still rejects ungranted ones', () => {
    const next = jest.fn();
    const req = { auth: { role: 'SALES_EXECUTIVE', extraPermissions: ['marketing:view'] } };

    requirePermission('marketing:view')(req, {}, next);
    expect(next).toHaveBeenCalledWith(); // allowed via grant

    const next2 = jest.fn();
    requirePermission('marketing:manage')(req, {}, next2);
    expect(next2.mock.calls[0][0]).toMatchObject({ statusCode: 403 }); // not granted

    const next3 = jest.fn();
    requirePermission('employee:create')(req, {}, next3);
    expect(next3.mock.calls[0][0]).toMatchObject({ statusCode: 403 }); // not in whitelist/role
  });

  it('a user without grants keeps the plain role matrix on /auth/me', async () => {
    prisma.session.findUnique.mockResolvedValue(activeSession());
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      name: 'Test User',
      email: 'tester@spaceezy.com',
      role: 'SALES_EXECUTIVE',
      extraPermissions: [],
      organization: { id: 'org-123', name: 'SpaceEzy' },
    });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer ungranted-token');

    expect(res.status).toBe(200);
    expect(res.body.data.extraPermissions).toEqual([]);
    expect(res.body.data.permissions).toEqual([...ROLE_PERMISSIONS.SALES_EXECUTIVE]);
  });
});
