-- Playground schema. Everything the app owns lives in schema "app";
-- ground-truth bookkeeping lives in schema "meta". Only these two schemas
-- are ever dropped, so pointing DATABASE_URL at a shared server is safe.

DROP SCHEMA IF EXISTS app CASCADE;
DROP SCHEMA IF EXISTS meta CASCADE;
CREATE SCHEMA app;
CREATE SCHEMA meta;

SET search_path TO app, meta;

-- ---------------------------------------------------------------------------
-- Ground-truth bookkeeping
-- ---------------------------------------------------------------------------

-- One row per real row change in any app table.
CREATE TABLE meta.audit_log (
    id          BIGSERIAL PRIMARY KEY,
    ts          TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    tbl         TEXT NOT NULL,
    op          TEXT NOT NULL,
    old_row     JSONB,
    new_row     JSONB,
    request_id  TEXT,          -- HTTP request that caused it, or 'external'
    scenario    TEXT           -- scenario id of the route that caused it
);

-- One row per HTTP request served by the app (reads included).
CREATE TABLE meta.request_log (
    id          BIGSERIAL PRIMARY KEY,
    ts          TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    request_id  TEXT NOT NULL,
    method      TEXT NOT NULL,
    path        TEXT NOT NULL,
    status      INT,
    scenario    TEXT
);

CREATE OR REPLACE FUNCTION meta.audit() RETURNS trigger AS $$
BEGIN
    -- A no-op UPDATE (same values) is not a persistent change.
    IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN
        RETURN NEW;
    END IF;
    INSERT INTO meta.audit_log (tbl, op, old_row, new_row, request_id, scenario)
    VALUES (
        TG_TABLE_NAME,
        TG_OP,
        CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
        CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END,
        NULLIF(current_setting('app.request_id', true), ''),
        NULLIF(current_setting('app.scenario', true), '')
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Application tables
-- ---------------------------------------------------------------------------

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name     TEXT NOT NULL,
    email         TEXT NOT NULL,
    phone         TEXT NOT NULL
);

CREATE TABLE sessions (
    token      TEXT PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE settings (
    user_id        INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email_digest   TEXT NOT NULL CHECK (email_digest IN ('off', 'daily', 'weekly')),
    sms_alerts     BOOLEAN NOT NULL,
    items_per_page INT NOT NULL,
    profile_public BOOLEAN NOT NULL
);

CREATE TABLE products (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL,
    price_cents INT NOT NULL,
    stock       INT NOT NULL,
    description TEXT NOT NULL,
    specs       TEXT NOT NULL
);

CREATE TABLE reviews (
    id         SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    author     TEXT NOT NULL,
    stars      INT NOT NULL,
    body       TEXT NOT NULL
);

CREATE TABLE ratings (
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    stars      INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
    PRIMARY KEY (user_id, product_id)
);

CREATE TABLE recently_viewed (
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    viewed_seq BIGSERIAL,
    PRIMARY KEY (user_id, product_id)
);

CREATE TABLE wishlist (
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, product_id)
);

CREATE TABLE follows (
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, product_id)
);

CREATE TABLE cart_items (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    qty        INT NOT NULL CHECK (qty > 0),
    UNIQUE (user_id, product_id)
);

CREATE TABLE addresses (
    id      SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label      TEXT NOT NULL,
    line       TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE coupons (
    code        TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    percent_off INT NOT NULL
);

CREATE TABLE coupon_claims (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code    TEXT NOT NULL REFERENCES coupons(code) ON DELETE CASCADE,
    PRIMARY KEY (user_id, code)
);

CREATE TABLE orders (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address_id  INT NOT NULL REFERENCES addresses(id),
    shipping    TEXT NOT NULL CHECK (shipping IN ('standard', 'express')),
    coupon_code TEXT,
    total_cents INT NOT NULL,
    placed_at   TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'placed' CHECK (status IN ('placed', 'cancelled'))
);

CREATE TABLE order_items (
    id          SERIAL PRIMARY KEY,
    order_id    INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id  INT NOT NULL REFERENCES products(id),
    qty         INT NOT NULL,
    price_cents INT NOT NULL
);

CREATE TABLE messages (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender     TEXT NOT NULL,
    subject    TEXT NOT NULL,
    body       TEXT NOT NULL,
    sent_at    TEXT NOT NULL,
    sort_key   BIGINT NOT NULL,
    is_read    BOOLEAN NOT NULL DEFAULT false,
    is_starred BOOLEAN NOT NULL DEFAULT false,
    is_snoozed BOOLEAN NOT NULL DEFAULT false,
    folder     TEXT NOT NULL DEFAULT 'inbox' CHECK (folder IN ('inbox', 'archive'))
);

CREATE TABLE replies (
    id         SERIAL PRIMARY KEY,
    message_id INT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    body       TEXT NOT NULL
);

CREATE TABLE drafts (
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id INT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    PRIMARY KEY (user_id, message_id)
);

CREATE TABLE newsletter_subscriptions (
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    list       TEXT NOT NULL,
    title      TEXT NOT NULL,
    subscribed BOOLEAN NOT NULL,
    PRIMARY KEY (user_id, list)
);

CREATE TABLE todos (
    id      SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title   TEXT NOT NULL,
    done     BOOLEAN NOT NULL DEFAULT false,
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high'))
);

CREATE TABLE notes (
    user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    body    TEXT NOT NULL
);

CREATE TABLE support_tickets (
    id       SERIAL PRIMARY KEY,
    user_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic    TEXT NOT NULL,
    subject  TEXT NOT NULL,
    body     TEXT NOT NULL
);

-- Attach the audit trigger to every app table.
DO $$
DECLARE t TEXT;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'app' LOOP
        EXECUTE format(
            'CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON app.%1$I
             FOR EACH ROW EXECUTE FUNCTION meta.audit()', t);
    END LOOP;
END;
$$;
