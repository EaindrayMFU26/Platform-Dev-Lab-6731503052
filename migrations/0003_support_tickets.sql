-- Support tickets: the downstream action of the AI routing capability (assignment A6).
--
-- One row per support message. The routing decision (queue, urgency, needs_human) is stored
-- with the ticket together with where it came from: the decision model, or the deterministic
-- fallback when the model was unavailable or answered with something invalid. The full
-- validated decision (probabilities, confidence, timings) is kept as JSON text for auditing.
CREATE TABLE support_tickets (
  id              TEXT NOT NULL PRIMARY KEY,
  message         TEXT NOT NULL CHECK (length(trim(message)) > 0),
  equipment_id    TEXT REFERENCES equipment (id),
  booking_id      TEXT,
  queue           TEXT NOT NULL CHECK (queue IN ('booking_change', 'equipment_fault', 'access_or_account', 'general_question')),
  urgency         TEXT NOT NULL CHECK (urgency IN ('low', 'normal', 'high')),
  needs_human     INTEGER NOT NULL CHECK (needs_human IN (0, 1)),
  confidence      REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  decision_source TEXT NOT NULL CHECK (decision_source IN ('model', 'fallback')),
  decision_model  TEXT,
  fallback_reason TEXT,
  decision_json   TEXT NOT NULL CHECK (json_valid(decision_json)),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Staff read one queue at a time, newest first.
CREATE INDEX idx_support_tickets_queue ON support_tickets (queue, created_at);
