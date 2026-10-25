-- Shoba Creations storefront editorial content.
--
-- The homepage's journal cards, customer quotes and decorative brand imagery
-- used to be hardcoded in the frontend bundle. They are seeded here so the
-- browser fetches them from the API like every other piece of content.
--
-- Re-runnable: all three tables are upserted on their natural key, so the seed
-- can be replayed after an edit to the copy.
--
-- The image URLs below are the same Unsplash sources the storefront demo used.
-- Swapping in real photography means updating these rows, not the frontend.

-- ---------------------------------------------------------------------------
-- Decorative brand imagery.
--
-- Only images that belong to no single record are listed here. Product photos
-- live in product_images, category headers in categories.hero_image_url, and
-- story/quote images on their own tables, so those are not duplicated here.
-- ---------------------------------------------------------------------------
INSERT INTO site_images (key, url, alt, width, height)
VALUES
  ('hero',
   'https://images.unsplash.com/photo-1769275061356-a038b498c4a7?auto=format&fit=crop&w=2200&h=1500&q=86',
   'Handwoven silk drape catching the light', 2200, 1500),
  ('hero_secondary',
   'https://images.unsplash.com/photo-1771507056578-f9675a2a8f8a?auto=format&fit=crop&w=1200&h=1500&q=86',
   'Folded textiles in a heritage studio', 1200, 1500),
  ('palace',
   'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1800&h=1200&q=86',
   'Carved arches of a Rajasthani courtyard', 1800, 1200),
  ('palace_secondary',
   'https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1200&h=1500&q=86',
   'Temple jewellery resting on carved stone', 1200, 1500)
ON CONFLICT (key) DO UPDATE SET
  url = EXCLUDED.url,
  alt = EXCLUDED.alt,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Journal cards.
--
-- published_at is set explicitly rather than defaulted to NOW() so replaying the
-- seed does not silently reshuffle the editorial order.
-- ---------------------------------------------------------------------------
INSERT INTO editorial_stories (
  slug, title, excerpt, body, image_url, image_alt, read_time, author_name, sort_order, is_published, published_at
)
VALUES
  ('the-story-of-the-saree',
   'The Story of the Saree',
   'A quiet study of drape, memory, and the hands that keep a weave alive.',
   'Every saree begins as a length of thread and an argument between the loom and the weaver. In Kanchipuram, where the Kanjeevaram takes shape, that argument has been running for six centuries: the zari is pulled tight enough to sing, the border wide enough to carry a story across the shoulder. What arrives in the parcel is the end of a long chain of decisions, made by people whose names are usually recorded nowhere.',
   'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&h=1500&q=86',
   'Textile folds in a heritage studio',
   '6 min read', 'Shoba Creations House', 1, TRUE, '2026-04-12T09:00:00Z'),

  ('the-art-of-temple-jewellery',
   'The Art of Temple Jewellery',
   'How sacred geometry becomes an heirloom you can wear every day.',
   'Temple jewellery began as an offering: small forms of gods, lotuses and pillars, cast in gold and meant for a deity rather than a person. What travelled south with the traders was the geometry, not the ritual, and over a few centuries it shed its scale. A necklace that once sat on a processional elephant now rests at the collarbone, and the same motifs are still chased by hand.',
   'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1200&h=1500&q=86',
   'Antique gold jewellery detail',
   '4 min read', 'Shoba Creations House', 2, TRUE, '2026-05-03T09:00:00Z'),

  ('crafted-by-hand',
   'Crafted by Hand',
   'Meet the artisans behind our small-batch collections and considered details.',
   'We buy in small batches, which means we know the workshop, and we know when a loom is running. That relationship is the reason a shipment sometimes arrives late, and also the reason the mirror work on a kurta is set by hand rather than glued. Small batches are not a marketing position here. They are the only way to work with people whose names we can say.',
   'https://images.unsplash.com/photo-1532664189809-02133fee698d?auto=format&fit=crop&w=1200&h=1500&q=86',
   'Carved Indian architectural detail',
   '5 min read', 'Shoba Creations House', 3, TRUE, '2026-05-27T09:00:00Z')
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  excerpt = EXCLUDED.excerpt,
  body = EXCLUDED.body,
  image_url = EXCLUDED.image_url,
  image_alt = EXCLUDED.image_alt,
  read_time = EXCLUDED.read_time,
  author_name = EXCLUDED.author_name,
  sort_order = EXCLUDED.sort_order,
  is_published = EXCLUDED.is_published,
  published_at = EXCLUDED.published_at,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Customer quotes.
--
-- user_id is left NULL on purpose: these are attributed to the customer by name
-- and city, not tied to a login. Set it when a verified review is imported.
-- The conflict target is the content-identity index, so replaying the seed
-- refreshes the copy instead of appending a duplicate.
-- ---------------------------------------------------------------------------
INSERT INTO testimonials (user_id, name, city, quote, rating, image_url, image_alt, sort_order, is_published)
VALUES
  (NULL, 'Ananya Rao', 'Bengaluru',
   'The saree arrived like a piece of family history. The finish is even more beautiful in person.',
   5,
   'https://images.unsplash.com/photo-1760461805697-7aff3e93c5d9?auto=format&fit=crop&w=1200&h=1500&q=86',
   'Ananya in traditional attire', 1, TRUE),

  (NULL, 'Meera Shah', 'Mumbai',
   'The jhumkas are delicate, elegant, and somehow work with every outfit I own.',
   5,
   'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&h=1500&q=86',
   'Meera wearing heritage jewellery', 2, TRUE),

  (NULL, 'Kavya Iyer', 'Chennai',
   'My bridal look felt modern, but still unmistakably rooted in tradition. Truly exceptional.',
   5,
   'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&h=1500&q=86',
   'Kavya in a palace setting', 3, TRUE)
ON CONFLICT (name, city, md5(quote)) DO UPDATE SET
  rating = EXCLUDED.rating,
  image_url = EXCLUDED.image_url,
  image_alt = EXCLUDED.image_alt,
  sort_order = EXCLUDED.sort_order,
  is_published = EXCLUDED.is_published,
  updated_at = NOW();
