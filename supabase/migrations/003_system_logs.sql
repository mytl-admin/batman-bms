-- P1-13 system_logs (before core indexes that reference it)

CREATE TABLE system_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    VARCHAR NOT NULL,
  entity_type   VARCHAR NOT NULL,
  entity_id     UUID,
  actor_id      UUID REFERENCES users(id),
  actor_role    VARCHAR,
  before_state  JSONB,
  after_state   JSONB,
  metadata      JSONB,
  created_at    TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_system_logs_event_type ON system_logs(event_type);
CREATE INDEX idx_system_logs_entity ON system_logs(entity_type, entity_id);
CREATE INDEX idx_system_logs_actor ON system_logs(actor_id);
CREATE INDEX idx_system_logs_created ON system_logs(created_at DESC);
