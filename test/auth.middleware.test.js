const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createAuthMiddleware } = require('../src/middleware/auth');
const { accessKeyForMemberCode, generateToken } = require('../src/utils/generateToken');

const secret = 'test-jwt-secret-at-least-32-characters-long';

function mockUser(overrides = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440001',
    member_code: 'testmembercode12345',
    role: 'admin',
    email: 'admin@example.com',
    name: 'Admin',
    is_active: true,
    ...overrides,
  };
}

function mockSupabase(userRow) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: userRow, error: null }),
              };
            },
          };
        },
      };
    },
  };
}

function runAuth(mw, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 0,
      body: undefined,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(b) {
        this.body = b;
        resolve(this);
      },
    };
    mw(req, res, () => resolve({ ok: true }));
  });
}

test('auth: missing authorization header → 401', async () => {
  process.env.JWT_SECRET = secret;
  const mw = createAuthMiddleware(mockSupabase(mockUser()));
  const res = await runAuth(mw, { headers: {} });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Missing or malformed authorization header');
});

test('auth: malformed authorization header → 401', async () => {
  process.env.JWT_SECRET = secret;
  const mw = createAuthMiddleware(mockSupabase(mockUser()));
  const res = await runAuth(mw, {
    headers: { authorization: 'NotBearer x', 'x-member-code': 'x' },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Missing or malformed authorization header');
});

test('auth: invalid token → 401', async () => {
  process.env.JWT_SECRET = secret;
  const mw = createAuthMiddleware(mockSupabase(mockUser()));
  const res = await runAuth(mw, {
    headers: { authorization: 'Bearer not-a-jwt', 'x-member-code': 'mc' },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Invalid token');
});

test('auth: expired token → 401', async () => {
  process.env.JWT_SECRET = secret;
  const mc = 'expiremembercode12';
  const token = jwt.sign(
    {
      member_code: mc,
      access_key: accessKeyForMemberCode(mc),
      role: 'admin',
    },
    secret,
    { expiresIn: '0s' },
  );
  const mw = createAuthMiddleware(mockSupabase(mockUser({ member_code: mc })));
  const res = await runAuth(mw, {
    headers: { authorization: `Bearer ${token}`, 'x-member-code': mc },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Invalid token');
});

test('auth: missing X-Member-Code → 401', async () => {
  process.env.JWT_SECRET = secret;
  const mc = 'membercodeheader01';
  const token = generateToken({ member_code: mc, role: 'admin' }, secret);
  const mw = createAuthMiddleware(mockSupabase(mockUser({ member_code: mc })));
  const res = await runAuth(mw, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Missing member code header');
});

test('auth: member_code mismatch → 401', async () => {
  process.env.JWT_SECRET = secret;
  const mc = 'membermismatch001';
  const token = generateToken({ member_code: mc, role: 'admin' }, secret);
  const mw = createAuthMiddleware(mockSupabase(mockUser({ member_code: mc })));
  const res = await runAuth(mw, {
    headers: { authorization: `Bearer ${token}`, 'x-member-code': 'other-code' },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Member code mismatch');
});

test('auth: invalid access_key in JWT → 401', async () => {
  process.env.JWT_SECRET = secret;
  const mc = 'badaccesskey0001';
  const token = jwt.sign({ member_code: mc, access_key: 'wrong-hash', role: 'admin' }, secret, {
    expiresIn: '1h',
  });
  const mw = createAuthMiddleware(mockSupabase(mockUser({ member_code: mc })));
  const res = await runAuth(mw, {
    headers: { authorization: `Bearer ${token}`, 'x-member-code': mc },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Invalid access key');
});

test('auth: deactivated account → 401', async () => {
  process.env.JWT_SECRET = secret;
  const mc = 'inactiveuser00001';
  const token = generateToken({ member_code: mc, role: 'admin' }, secret);
  const mw = createAuthMiddleware(mockSupabase(mockUser({ member_code: mc, is_active: false })));
  const res = await runAuth(mw, {
    headers: { authorization: `Bearer ${token}`, 'x-member-code': mc },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Account deactivated');
});

test('auth: valid token → next with req.user', async (t) => {
  process.env.JWT_SECRET = secret;
  const mc = 'validmembercode0001';
  const token = generateToken({ member_code: mc, role: 'agent' }, secret);
  const user = mockUser({ member_code: mc, role: 'agent' });
  const mw = createAuthMiddleware(mockSupabase(user));

  await new Promise((resolve, reject) => {
    const req = {
      headers: { authorization: `Bearer ${token}`, 'x-member-code': mc },
    };
    const res = {
      status() {
        return this;
      },
      json() {
        reject(new Error('should not json'));
      },
    };
    mw(req, res, () => {
      assert.equal(req.user.id, user.id);
      assert.equal(req.user.role, 'agent');
      assert.equal(req.user.member_code, mc);
      resolve();
    });
  });
});
