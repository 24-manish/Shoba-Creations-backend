-- Move the storefront's editorial content out of the frontend bundle and into the
-- database, so the browser fetches it from the same API as everything else.
--
-- Three concerns, three tables:
--   site_images         - the handful of decorative brand images that belong to
--                         no single record (homepage hero, palace panels)
--   editorial_stories   - the journal cards on the homepage
--   testimonials        - the customer quotes on the homepage
--
-- Product photography deliberately does NOT live here: it already belongs to
-- product_images, and the frontend must render those rather than a static map.

-- ---------------------------------------------------------------------------
-- site_images: a small key/value registry for brand imagery.
-- The key is a stable identifier the frontend asks for by name, so reordering
-- rows never breaks a reference the way an array index would.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  width INTEGER,
  height INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT site_images_key_format CHECK (key ~ '^[a-z0-9_]+$'),
  CONSTRAINT site_images_dimensions CHECK (
    (width IS NULL OR width > 0) AND (height IS NULL OR height > 0)
  )
);

CREATE INDEX IF NOT EXISTS site_images_active_idx ON site_images(is_active);

-- ---------------------------------------------------------------------------
-- editorial_stories: the journal entries the homepage links to.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS editorial_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(160) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  excerpt VARCHAR(600) NOT NULL,
  body TEXT,
  image_url TEXT NOT NULL,
  image_alt TEXT NOT NULL DEFAULT '',
  read_time VARCHAR(40),
  author_name VARCHAR(120),
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A story that is marked published without a date would sort unpredictably
  -- against the ones that have one.
  CONSTRAINT editorial_stories_published_at CHECK (is_published = FALSE OR published_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS editorial_stories_published_idx
  ON editorial_stories(is_published, published_at DESC);

-- ---------------------------------------------------------------------------
-- testimonials: customer quotes shown on the homepage.
-- A quote is pinned to a customer account when user_id is set, so deleting the
-- account removes the testimonial instead of orphaning a name and a city.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  name VARCHAR(120) NOT NULL,
  city VARCHAR(100),
  quote VARCHAR(1000) NOT NULL,
  rating SMALLINT NOT NULL DEFAULT 5,
  image_url TEXT,
  image_alt TEXT NOT NULL DEFAULT '',
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT testimonials_rating_range CHECK (rating BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS testimonials_published_idx
  ON testimonials(is_published, sort_order, created_at DESC);

-- A quote has no surrogate key of its own, so its content is its identity. This
-- makes the seed replayable without adding a column that exists only for
-- seeding, and stops the same review being imported twice. md5() keeps the
-- index inside PostgreSQL's btree size limit, which quote VARCHAR(1000) alone
-- would exceed.
CREATE UNIQUE INDEX IF NOT EXISTS testimonials_identity_idx
  ON testimonials(name, city, md5(quote));

-- updated_at is maintained by the repositories, matching the convention the
-- catalogue tables already use, so there is deliberately no trigger here.
