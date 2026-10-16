-- Every booking or enquiry a visitor sends.
CREATE TABLE requests (
  id          TEXT PRIMARY KEY,           -- short reference shown to the visitor, e.g. "K7QM-2F"
  site        TEXT NOT NULL,              -- sites/<id>.json
  kind        TEXT NOT NULL CHECK (kind IN ('booking', 'enquiry')),
  service     TEXT,                       -- service id from the site config
  date        TEXT,                       -- local date at the business, YYYY-MM-DD
  time        TEXT,                       -- local start time, HH:MM
  minutes     INTEGER,                    -- length of the service
  name        TEXT NOT NULL,
  contact_via TEXT NOT NULL CHECK (contact_via IN ('call', 'text', 'email')),
  phone       TEXT,
  email       TEXT,
  message     TEXT,
  status      TEXT NOT NULL DEFAULT 'new'
              CHECK (status IN ('new', 'confirmed', 'declined', 'done', 'cancelled')),
  created_at  TEXT NOT NULL,              -- UTC ISO timestamp
  ip_hash     TEXT                        -- salted daily hash, for rate limiting only
);

CREATE INDEX requests_by_site ON requests (site, status, date, time);
CREATE INDEX requests_by_ip ON requests (site, ip_hash, created_at);

-- One row per slot a live booking occupies. The primary key is what makes
-- double booking impossible: two requests for the same slot can't both insert.
CREATE TABLE holds (
  site       TEXT NOT NULL,
  date       TEXT NOT NULL,
  time       TEXT NOT NULL,
  request_id TEXT NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
  PRIMARY KEY (site, date, time)
);

CREATE INDEX holds_by_request ON holds (request_id);
