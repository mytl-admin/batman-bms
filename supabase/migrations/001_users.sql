-- P1-05 users + credential storage for invite/login (password_hash holds bcrypt hash of temporary invite code)
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             VARCHAR UNIQUE NOT NULL,
  member_code       VARCHAR UNIQUE NOT NULL,
  name              VARCHAR NOT NULL,
  role              VARCHAR NOT NULL CHECK (role IN ('agent', 'admin')),
  password_hash     TEXT NOT NULL,
  is_active         BOOLEAN DEFAULT true,
  invited_by        UUID REFERENCES users(id),
  invited_at        TIMESTAMP,
  last_login_at     TIMESTAMP,
  created_at        TIMESTAMP DEFAULT now(),
  updated_at        TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_users_member_code ON users(member_code);
CREATE INDEX idx_users_email ON users(email);
