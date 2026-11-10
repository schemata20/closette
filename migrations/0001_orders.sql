CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  request_key TEXT UNIQUE NOT NULL,
  request_hash TEXT NOT NULL,
  customer_json TEXT NOT NULL,
  items_json TEXT NOT NULL,
  total INTEGER NOT NULL CHECK(total > 0),
  payment_status TEXT NOT NULL DEFAULT 'pending',
  fulfilment_status TEXT NOT NULL DEFAULT 'new',
  bill_id TEXT UNIQUE,
  bill_url TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at);
CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  recipient TEXT NOT NULL,
  payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT
);
CREATE TABLE IF NOT EXISTS request_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
