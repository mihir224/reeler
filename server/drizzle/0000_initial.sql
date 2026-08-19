CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE event_status AS ENUM ('accepted', 'partially_delivered', 'delivered', 'failed');
CREATE TYPE delivery_status AS ENUM ('pending', 'in_progress', 'delivered', 'retry_scheduled', 'failed');
CREATE TYPE attempt_status AS ENUM ('succeeded', 'retry_scheduled', 'failed');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret text NOT NULL,
  event_types text[] NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE event_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status event_status NOT NULL DEFAULT 'accepted',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  status delivery_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  last_error text,
  last_response_code integer,
  first_attempted_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  status attempt_status NOT NULL,
  response_code integer,
  response_body_preview text,
  error_message text,
  latency_ms integer NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE replay_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  replayed_at timestamptz NOT NULL DEFAULT now(),
  replay_triggered_by text NOT NULL
);

CREATE INDEX api_keys_key_hash_idx ON api_keys(key_hash);
CREATE INDEX endpoints_app_id_event_types_idx ON endpoints USING gin(event_types);
CREATE INDEX event_catalog_app_id_name_idx ON event_catalog(app_id, name);
CREATE INDEX events_app_id_created_at_idx ON events(app_id, created_at DESC);
CREATE INDEX deliveries_due_idx ON deliveries(status, next_retry_at, created_at);
CREATE INDEX deliveries_event_id_idx ON deliveries(event_id);
CREATE INDEX delivery_attempts_delivery_id_idx ON delivery_attempts(delivery_id, attempted_at DESC);
