-- Campus Equipment Booking: schema.
-- Apply locally with: npm run db:migrate

-- A shared resource that can be reserved (projector, camera, meeting room).
CREATE TABLE equipment (
  id       TEXT PRIMARY KEY NOT NULL,
  name     TEXT NOT NULL CHECK (length(trim(name)) > 0),
  location TEXT NOT NULL CHECK (length(trim(location)) > 0)
) STRICT;

-- One reservation of one piece of equipment for the time range [start_at, end_at).
--
-- Times are stored as fixed-width ISO 8601 UTC text, for example 2026-10-20T09:00:00.000Z.
-- Every value has the same shape and the same time zone, so comparing two of these
-- strings compares the two instants. The overlap rule and CHECK (start_at < end_at)
-- both rely on that, so the shape itself is enforced: a stored time must be exactly the
-- text SQLite prints for that instant. The +0 seconds modifier makes SQLite recompute
-- the date, so impossible values such as 30 February or 24:00 come back as a different
-- text and are rejected. Anything that is not a date-time gives NULL and is rejected too.
CREATE TABLE bookings (
  id            TEXT PRIMARY KEY NOT NULL,
  equipment_id  TEXT NOT NULL REFERENCES equipment (id),
  borrower_name TEXT NOT NULL CHECK (length(trim(borrower_name)) > 0),
  start_at      TEXT NOT NULL CHECK (start_at IS strftime('%Y-%m-%dT%H:%M:%fZ', start_at, '+0 seconds')),
  end_at        TEXT NOT NULL CHECK (end_at IS strftime('%Y-%m-%dT%H:%M:%fZ', end_at, '+0 seconds')),
  purpose       TEXT NOT NULL CHECK (length(trim(purpose)) > 0),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (start_at < end_at)
) STRICT;

-- Serves the overlap check: bookings of one equipment that intersect a time range.
CREATE INDEX idx_bookings_equipment_time ON bookings (equipment_id, start_at, end_at);
