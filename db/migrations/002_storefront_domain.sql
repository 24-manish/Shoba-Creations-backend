-- Reshape the generic commerce schema into the Shoba Creations storefront domain.
--
-- Adds the editorial/catalogue fields the storefront renders, introduces variant
-- aware cart lines, per-user wishlists, rotating refresh tokens, and an inventory
-- movement audit trail. Order statuses are aligned with the admin UI vocabulary.

-- ---------------------------------------------------------------------------
-- Clean up the template seed rows from 001. There are no carts or orders in a
-- fresh install, so removing them here keeps the NOT NULL additions below safe.
-- ---------------------------------------------------------------------------
DELETE FROM products WHERE slug IN (
  'handmade-ceramic-vase',
  'linen-table-runner',
  'wireless-earbuds',
  'portable-bluetooth-speaker',
  'canvas-tote-bag',
  'minimal-wallet'
);

DELETE FROM categories WHERE slug IN ('home', 'electronics', 'accessories');

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(24);
ALTER TABLE users ADD COLUMN IF NOT EXISTS initials VARCHAR(4);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
ALTER TABLE categories ADD COLUMN IF NOT EXISTS tagline VARCHAR(160);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS hero_image_url TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS categories_sort_idx ON categories(sort_order, name);

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku VARCHAR(64);
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC(12, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_label VARCHAR(40);
ALTER TABLE products ADD COLUMN IF NOT EXISTS rating NUMERIC(2, 1) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS colors TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS color_options JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS fabric VARCHAR(160) NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS occasion VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS collection VARCHAR(160) NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS region VARCHAR(160) NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS artisan VARCHAR(160) NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS details TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS care TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS tone VARCHAR(20) NOT NULL DEFAULT 'burgundy';
ALTER TABLE products ADD COLUMN IF NOT EXISTS badge VARCHAR(40);
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_new BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_point INTEGER NOT NULL DEFAULT 5;

-- Backfill the SKU from the existing slug so the unique constraint can be added
-- for databases that already contain product rows.
UPDATE products
SET sku = UPPER(REGEXP_REPLACE(LEFT(slug, 24), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE sku IS NULL;

ALTER TABLE products ALTER COLUMN sku SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_sku_key') THEN
    ALTER TABLE products ADD CONSTRAINT products_sku_key UNIQUE (sku);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_tone_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_tone_check
      CHECK (tone IN ('burgundy', 'gold', 'emerald', 'ivory', 'plum', 'terracotta', 'ink'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_compare_at_price_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_compare_at_price_check
      CHECK (compare_at_price IS NULL OR compare_at_price > price);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_rating_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_rating_check
      CHECK (rating >= 0 AND rating <= 5);
  END IF;
END $$;

ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', COALESCE(name, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(subcategory, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(artisan, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(collection, '')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(fabric, '')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(region, '')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(occasion, '')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(description, '')), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS products_search_idx ON products USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS products_featured_idx ON products(is_featured DESC, is_new DESC);
CREATE INDEX IF NOT EXISTS products_sku_idx ON products(sku);

-- ---------------------------------------------------------------------------
-- product_images
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt TEXT,
  position SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_images_product_idx ON product_images(product_id, position);

-- ---------------------------------------------------------------------------
-- wishlists
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wishlists (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS wishlists_user_idx ON wishlists(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- refresh_tokens (rotating, family tracked)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by_id UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens(family_id);

-- ---------------------------------------------------------------------------
-- inventory_movements (stock audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  previous_stock INTEGER NOT NULL,
  resulting_stock INTEGER NOT NULL,
  reason VARCHAR(40) NOT NULL DEFAULT 'adjustment'
    CHECK (reason IN ('adjustment', 'restock', 'sale', 'cancellation', 'seed')),
  note TEXT,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_movements_product_idx
  ON inventory_movements(product_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- cart_items: colour and size become real line dimensions
-- ---------------------------------------------------------------------------
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS selected_color VARCHAR(80);
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS selected_size VARCHAR(40);

ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_cart_id_product_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_variant_key
  ON cart_items (
    cart_id,
    product_id,
    COALESCE(selected_color, ''),
    COALESCE(selected_size, '')
  );

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 10483;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(16);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'online_store';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS city VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone VARCHAR(24) NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS state VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pincode VARCHAR(10) NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'upi';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_method VARCHAR(20) NOT NULL DEFAULT 'standard';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS handling_fee NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS item_count INTEGER NOT NULL DEFAULT 0;

UPDATE orders SET order_number = 'SC-' || nextval('order_number_seq') WHERE order_number IS NULL;

ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_number_key') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_channel_check') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_channel_check
      CHECK (channel IN ('online_store', 'wholesale'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_method_check') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
      CHECK (payment_method IN ('upi', 'card', 'cod'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_shipping_method_check') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_shipping_method_check
      CHECK (shipping_method IN ('standard', 'express'));
  END IF;
END $$;

-- Frontend vocabulary: Processing / Packed / Shipped / Delivered / Cancelled.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('processing', 'packed', 'shipped', 'delivered', 'cancelled'));

-- Map any legacy 'pending' rows onto the new vocabulary before the default moves.
UPDATE orders SET status = 'processing' WHERE status = 'pending';

ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'processing';

CREATE INDEX IF NOT EXISTS orders_number_idx ON orders(order_number);
CREATE INDEX IF NOT EXISTS orders_channel_idx ON orders(channel, created_at DESC);

-- ---------------------------------------------------------------------------
-- order_items: snapshot the variant so history survives catalogue edits
-- ---------------------------------------------------------------------------
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sku VARCHAR(64);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_color VARCHAR(80);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_size VARCHAR(40);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS image_url TEXT;
