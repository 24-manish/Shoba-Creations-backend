-- Shoba Creations storefront catalogue.
--
-- Replaces the original placeholder seed with the real seven categories and
-- seventeen products from the storefront demo, complete with the editorial
-- fields the UI renders. Re-runnable: categories and products are upserted and
-- their images are rebuilt, so the seed can be replayed after a catalogue edit.
--
-- Demo customer accounts share the documented password "Shoba@2026"
-- (bcrypt hash below). The admin account is created by scripts/seed.js from
-- ADMIN_EMAIL / ADMIN_PASSWORD so the password is never stored in source.

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
INSERT INTO categories (name, slug, description, tagline, hero_image_url, sort_order)
VALUES
  ('Sarees', 'sarees', 'Handloom and brocade drapes from weaving centres across India.', 'Drapes with a story',
   'https://images.unsplash.com/photo-1758985402638-6028bae83b98?auto=format&fit=crop&w=1200&h=1500&q=86', 1),
  ('Jewellery', 'jewellery', 'Temple, bridal, and everyday fine jewellery.', 'Adorn your rituals',
   'https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=1200&h=1500&q=86', 2),
  ('Beauty', 'beauty', 'Botanical skincare, colour, and alcohol-free fragrance.', 'Everyday heritage',
   'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1200&h=1500&q=86', 3),
  ('Ethnic Wear', 'ethnic-wear', 'Blouses, kurtas, and tailoring for every ritual.', 'For the everyday',
   'https://images.unsplash.com/photo-1764305066079-3b8af0dbcc67?auto=format&fit=crop&w=1200&h=1500&q=86', 4),
  ('Handbags', 'handbags', 'Potli bags, clutches, and occasion pieces.', 'The finishing touch',
   'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&h=1500&q=86', 5),
  ('Accessories', 'accessories', 'Waist jewellery and the final detail.', 'The final detail',
   'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=1200&h=1500&q=86', 6),
  ('Gift Collections', 'gift-collections', 'Considered gift sets, wrapped by hand.', 'Give something rare',
   'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=1200&h=1500&q=86', 7)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tagline = EXCLUDED.tagline,
  hero_image_url = EXCLUDED.hero_image_url,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
WITH seed(category_slug, name, slug, sku, subcategory, description, price, compare_at_price,
          discount_label, rating, review_count, stock, reorder_point, colors, sizes,
          fabric, occasion, collection_name, region, artisan, details, care, tone, badge,
          is_new, is_featured) AS (
  VALUES
    ('sarees', 'Kanjeevaram Silk Saree', 'kanjeevaram-silk-saree', 'SC-SRK-101', 'Silk Sarees',
     'A ceremonial silk saree woven with traditional temple borders, rich zari, and the unmistakable depth of handloom Kanjeevaram.',
     12900, 15500, '17% off', 4.9, 86, 14, 6,
     ARRAY['Deep Maroon','Antique Gold','Ivory'], ARRAY['5.5 m','6.2 m'],
     'Pure mulberry silk', 'Bridal & festive', 'The Heritage Edit', 'Kanchipuram, Tamil Nadu', 'Anand Silk Weavers',
     ARRAY['Pure mulberry silk with zari','Contrasting handwoven border','Includes unstitched blouse fabric'],
     ARRAY['Dry clean only','Store folded in muslin','Keep away from direct sunlight'],
     'burgundy', 'Signature', FALSE, TRUE),

    ('sarees', 'Banarasi Zari Saree', 'banarasi-zari-saree', 'SC-SRK-204', 'Silk Sarees',
     'A luminous Banarasi drape with intricate zari floral motifs, made for evenings that deserve a little more light.',
     18500, 22000, '16% off', 4.8, 64, 9, 5,
     ARRAY['Deep Wine','Antique Gold'], ARRAY['5.5 m','6.2 m'],
     'Silk brocade', 'Wedding & reception', 'The Royal Edit', 'Varanasi, Uttar Pradesh', 'Benarasi Karigars Collective',
     ARRAY['Katan silk brocade','Handwoven zari pallu','Includes blouse fabric'],
     ARRAY['Dry clean only','Keep pleats intact','Store in a cotton saree wrapper'],
     'gold', 'Bestseller', FALSE, TRUE),

    ('sarees', 'Chanderi Handloom Saree', 'chanderi-handloom-saree', 'SC-SRK-309', 'Handloom Sarees',
     'An airy Chanderi saree with a soft sheen and a refined, story-like drape for long summer afternoons.',
     8900, NULL, NULL, 4.7, 39, 18, 8,
     ARRAY['Ivory','Muted Rose'], ARRAY['5.5 m'],
     'Silk-cotton Chanderi', 'Daytime festive', 'The Soft Edit', 'Chanderi, Madhya Pradesh', 'Chanderi Weaving Studio',
     ARRAY['Silk-cotton handloom','Subtle gold buti','Lightweight drape'],
     ARRAY['Gentle hand wash separately','Dry in shade','Steam lightly before wearing'],
     'ivory', NULL, TRUE, TRUE),

    ('sarees', 'Organza Embroidered Saree', 'organza-embroidered-saree', 'SC-SRK-412', 'Designer Sarees',
     'Sheer silk organza brought to life with tonal threadwork, fine sequins, and a beautifully restrained border.',
     11400, 13900, '18% off', 4.8, 51, 11, 5,
     ARRAY['Plum','Emerald'], ARRAY['5.5 m','6.2 m'],
     'Silk organza', 'Reception & festive', 'The Celebration Edit', 'Jaipur, Rajasthan', 'Aabha Embroidery Atelier',
     ARRAY['Silk organza base','Tonal zardozi embroidery','Matching blouse piece'],
     ARRAY['Dry clean only','Keep away from perfume','Store in muslin'],
     'plum', NULL, TRUE, TRUE),

    ('jewellery', 'Temple Lakshmi Necklace', 'temple-lakshmi-necklace', 'SC-JWL-101', 'Necklaces',
     'A finely detailed Lakshmi motif inspired by temple sculpture, with a warm antique-gold finish and delicate granulation.',
     4899, NULL, NULL, 4.9, 112, 16, 7,
     ARRAY['Antique Gold'], ARRAY['16-18 in'],
     'Gold-plated brass', 'Temple & festive', 'Deity Series', 'Thanjavur, Tamil Nadu', 'Sundar Fine Jewels',
     ARRAY['Antique-gold finish','Adjustable chain','Lightweight temple construction'],
     ARRAY['Keep away from moisture','Polish gently with a soft cloth','Store separately'],
     'gold', 'Bestseller', FALSE, TRUE),

    ('jewellery', 'Antique Gold Jhumkas', 'antique-gold-jhumkas', 'SC-JWL-212', 'Earrings',
     'Classic domed jhumkas with a softly oxidized finish, designed to move beautifully and pair with every saree.',
     3250, 3800, '14% off', 4.8, 77, 23, 10,
     ARRAY['Antique Gold'], ARRAY['2.5 in'],
     'Gold-plated brass', 'Everyday festive', 'The Everyday Jewellery Edit', 'Jaipur, Rajasthan', 'Rajput Jewellery House',
     ARRAY['Hand-finished jhumka form','Adjustable hook','Lightweight everyday construction'],
     ARRAY['Remove before bathing','Avoid perfume contact','Wipe with a dry cloth'],
     'gold', NULL, TRUE, TRUE),

    ('jewellery', 'Kundan Bridal Choker', 'kundan-bridal-choker', 'SC-JWL-318', 'Bridal Jewellery',
     'A bridal choker with the quiet drama of Kundan work, ruby-toned stones, and a hand-finished antique-gold setting.',
     8750, NULL, NULL, 5.0, 43, 7, 5,
     ARRAY['Ruby','Emerald','Ivory'], ARRAY['14-16 in'],
     'Gold-plated brass and kundan stones', 'Bridal', 'The Bridal Treasury', 'Jaipur, Rajasthan', 'Meenakari Karigar Collective',
     ARRAY['Kundan-inspired stones','Hand-painted enamel details','Adjustable velvet tie'],
     ARRAY['Store in the provided box','Avoid perfume and water','Clean with a dry soft cloth'],
     'burgundy', 'Bridal', FALSE, TRUE),

    ('jewellery', 'Meenakari Kada Set', 'meenakari-kada-set', 'SC-JWL-409', 'Bangles',
     'A vivid pair of kadas with traditional enamel detailing, balanced by a clean silhouette and comfortable inner edge.',
     5600, NULL, NULL, 4.7, 36, 13, 6,
     ARRAY['Emerald','Ruby'], ARRAY['2.4 in'],
     'Enamel and gold-plated brass', 'Festive & bridal', 'The Colour Edit', 'Jaipur, Rajasthan', 'Meenakari Karigar Collective',
     ARRAY['Hand-painted enamel','Set of two bangles','Comfort-fit inner edge'],
     ARRAY['Remove before water exposure','Store separately','Wipe gently after wear'],
     'emerald', NULL, TRUE, FALSE),

    ('ethnic-wear', 'Ivory Silk Blouse', 'ivory-silk-blouse', 'SC-BLU-110', 'Blouses',
     'A softly structured raw-silk blouse with a graceful square neckline, antique-gold buttons, and a clean, modern finish.',
     2890, 3400, '15% off', 4.8, 28, 20, 9,
     ARRAY['Ivory','Dusty Rose'], ARRAY['32','34','36','38','40'],
     'Raw silk', 'Bridal & festive', 'The Blouse Room', 'Chennai, Tamil Nadu', 'Kanika tailoring atelier',
     ARRAY['Premium raw silk','Antique-gold detailing','Back hook closure'],
     ARRAY['Dry clean only','Store flat or on a padded hanger','Steam from the reverse side'],
     'ivory', NULL, TRUE, TRUE),

    ('ethnic-wear', 'Mirror Work Kurta', 'mirror-work-kurta', 'SC-ETH-204', 'Kurtas',
     'A light cotton kurta with hand-set mirror work and a gently flared shape, made for warm days and festive evenings.',
     6400, NULL, NULL, 4.7, 45, 17, 8,
     ARRAY['Terracotta','Indigo'], ARRAY['XS','S','M','L','XL'],
     'Cotton voile', 'Festive & casual', 'The Crafted Edit', 'Kutch, Gujarat', 'Kutch Embroidery Collective',
     ARRAY['Hand-set mirror work','Cotton voile lining','Side pockets'],
     ARRAY['Gentle hand wash inside out','Dry in shade','Iron on medium heat'],
     'terracotta', NULL, FALSE, TRUE),

    ('handbags', 'Silk Potli Bag', 'silk-potli-bag', 'SC-BAG-118', 'Occasion Bags',
     'A structured potli bag with a rich silk body, antique-gold clasp, and enough room for the essentials that matter.',
     4200, NULL, NULL, 4.9, 61, 12, 5,
     ARRAY['Deep Maroon','Emerald'], ARRAY['One size'],
     'Raw silk', 'Wedding & festive', 'The Potli Edit', 'Lucknow, Uttar Pradesh', 'Lucknowi Silk Crafts',
     ARRAY['Raw silk outer','Cotton lining','Detachable inner pouch'],
     ARRAY['Spot clean gently','Keep away from rain','Store in dust bag'],
     'burgundy', 'Limited', TRUE, TRUE),

    ('handbags', 'Jade Velvet Clutch', 'jade-velvet-clutch', 'SC-BAG-226', 'Evening Bags',
     'A compact silk velvet clutch with a sculptural clasp and a jewel-toned finish that works beautifully with both sarees and tailoring.',
     5900, NULL, NULL, 4.8, 33, 8, 5,
     ARRAY['Deep Jade','Midnight'], ARRAY['One size'],
     'Silk velvet', 'Reception & evening', 'The Evening Edit', 'Mumbai, Maharashtra', 'Aarohi Accessories',
     ARRAY['Silk velvet exterior','Satin lining','Brushed antique-gold hardware'],
     ARRAY['Spot clean only','Do not overfill','Store in the supplied pouch'],
     'emerald', NULL, TRUE, FALSE),

    ('accessories', 'Jhumka Kamarbandh', 'jhumka-kamarbandh', 'SC-ACC-302', 'Waist Jewellery',
     'A delicate kamarbandh with tiny jhumka drops and pearl details, designed to move with a saree and catch the light.',
     3800, NULL, NULL, 4.6, 29, 15, 7,
     ARRAY['Antique Gold','Pearl'], ARRAY['Adjustable'],
     'Gold-plated alloy and pearl', 'Sangeet & festive', 'The Celebration Edit', 'Hyderabad, Telangana', 'Deccan Jewellery Works',
     ARRAY['Adjustable chain','Mini jhumka drops','Lightweight pearl accents'],
     ARRAY['Remove before sleeping','Keep away from water','Store in a soft pouch'],
     'gold', NULL, TRUE, FALSE),

    ('beauty', 'Sandalwood & Rose Face Oil', 'herbal-face-oil', 'SC-BTY-101', 'Face Care',
     'A nourishing facial oil with sandalwood, rose, and sesame oils to make the daily beauty ritual feel quietly ceremonial.',
     1850, NULL, NULL, 4.8, 74, 32, 14,
     ARRAY['Amber'], ARRAY['30 ml','100 ml'],
     'Botanical blend', 'Daily ritual', 'The Ayurvedic Edit', 'Kerala, India', 'Kaveri Botanicals',
     ARRAY['Cold-pressed botanical oils','No essential-oil overload','Recyclable amber glass'],
     ARRAY['Store in a cool place','Use within 6 months of opening','Patch test before use'],
     'terracotta', NULL, TRUE, TRUE),

    ('beauty', 'Madder & Rose Lipstick', 'madder-lipstick', 'SC-BTY-214', 'Lips',
     'A satin lipstick with the quiet depth of madder root, balanced by a soft rose finish and a comfortable, buttery feel.',
     1200, NULL, NULL, 4.7, 48, 26, 12,
     ARRAY['Madder','Rosewood','Brick'], ARRAY['One size'],
     'Botanical pigment', 'Everyday & evening', 'The Heritage Beauty Edit', 'Kerala, India', 'Ritu Colour Atelier',
     ARRAY['Botanical-inspired pigment','Satin finish','Refillable brass case'],
     ARRAY['Close cap tightly','Store away from heat','Wipe tube before closing'],
     'burgundy', NULL, TRUE, TRUE),

    ('beauty', 'Noor Attar', 'noor-attar', 'SC-BTY-319', 'Fragrance',
     'A soft, alcohol-free attar with rose, sandalwood, and saffron warmth, made for the skin and remembered long after.',
     2400, NULL, NULL, 4.9, 31, 19, 9,
     ARRAY['Amber'], ARRAY['6 ml','12 ml'],
     'Alcohol-free attar', 'Daily & festive', 'The House of Fragrance', 'Kannauj, Uttar Pradesh', 'Noor Attar House',
     ARRAY['Alcohol-free blend','Traditional dabber','Decorative glass vial'],
     ARRAY['Store away from direct light','Use on pulse points','Keep the cap tightly closed'],
     'gold', NULL, TRUE, FALSE),

    ('gift-collections', 'Royal Wedding Hamper', 'royal-wedding-hamper', 'SC-GFT-501', 'Wedding Gifts',
     'A considered gift set with a silk scarf, miniature attar, rose balm, and a hand-written note for someone special.',
     9999, 12500, '20% off', 4.9, 22, 6, 5,
     ARRAY['Burgundy & Gold'], ARRAY['One size'],
     'Assorted heritage goods', 'Wedding gifting', 'The Celebration Edit', 'Curated across India', 'Shoba Creations House',
     ARRAY['Silk scarf','Miniature Noor Attar','Rose balm and handwritten note'],
     ARRAY['See individual product care cards','Store in a dry place','Gift wrap included'],
     'burgundy', 'Gift edit', TRUE, TRUE)
)
INSERT INTO products (
  category_id, name, slug, sku, subcategory, description, price, compare_at_price, discount_label,
  rating, review_count, stock, reorder_point, colors, color_options, sizes, fabric, occasion,
  collection, region, artisan, details, care, tone, badge, is_new, is_featured, is_active
)
SELECT
  c.id, s.name, s.slug, s.sku, s.subcategory, s.description, s.price, s.compare_at_price, s.discount_label,
  s.rating, s.review_count, s.stock, s.reorder_point, s.colors, '[]'::jsonb, s.sizes, s.fabric, s.occasion,
  s.collection_name, s.region, s.artisan, s.details, s.care, s.tone, s.badge, s.is_new, s.is_featured, TRUE
FROM seed s
JOIN categories c ON c.slug = s.category_slug
ON CONFLICT (slug) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  sku = EXCLUDED.sku,
  subcategory = EXCLUDED.subcategory,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  compare_at_price = EXCLUDED.compare_at_price,
  discount_label = EXCLUDED.discount_label,
  rating = EXCLUDED.rating,
  review_count = EXCLUDED.review_count,
  -- stock and is_active are part of the documented baseline, so a replay has to
  -- restore them. Without this a suite that sold or archived a product left the
  -- catalogue permanently altered for every suite that ran after it.
  stock = EXCLUDED.stock,
  is_active = EXCLUDED.is_active,
  colors = EXCLUDED.colors,
  sizes = EXCLUDED.sizes,
  fabric = EXCLUDED.fabric,
  occasion = EXCLUDED.occasion,
  collection = EXCLUDED.collection,
  region = EXCLUDED.region,
  artisan = EXCLUDED.artisan,
  details = EXCLUDED.details,
  care = EXCLUDED.care,
  tone = EXCLUDED.tone,
  badge = EXCLUDED.badge,
  is_new = EXCLUDED.is_new,
  is_featured = EXCLUDED.is_featured,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Product images
--
-- The cover image is taken from the first product_images row, so the legacy
-- products.image_url column is kept in sync for anything still reading it.
-- ---------------------------------------------------------------------------
WITH gallery(product_slug, url, alt, position) AS (
  VALUES
    ('kanjeevaram-silk-saree', 'https://images.unsplash.com/photo-1769275061356-a038b498c4a7?auto=format&fit=crop&w=1200&h=1500&q=86', 'Kanjeevaram Silk Saree in a heritage-inspired setting', 0),
    ('kanjeevaram-silk-saree', 'https://images.unsplash.com/photo-1771507056578-f9675a2a8f8a?auto=format&fit=crop&w=1200&h=1500&q=86', 'Kanjeevaram Silk Saree detail and craft', 1),
    ('banarasi-zari-saree', 'https://images.unsplash.com/photo-1758985402638-6028bae83b98?auto=format&fit=crop&w=1200&h=1500&q=86', 'Banarasi Zari Saree in a heritage-inspired setting', 0),
    ('banarasi-zari-saree', 'https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1200&h=1500&q=86', 'Banarasi Zari Saree detail and craft', 1),
    ('chanderi-handloom-saree', 'https://images.unsplash.com/photo-1771507056578-f9675a2a8f8a?auto=format&fit=crop&w=1200&h=1500&q=86', 'Chanderi Handloom Saree in a heritage-inspired setting', 0),
    ('chanderi-handloom-saree', 'https://images.unsplash.com/photo-1758985402638-6028bae83b98?auto=format&fit=crop&w=1200&h=1500&q=86', 'Chanderi Handloom Saree detail and craft', 1),
    ('organza-embroidered-saree', 'https://images.unsplash.com/photo-1764305066079-3b8af0dbcc67?auto=format&fit=crop&w=1200&h=1500&q=86', 'Organza Embroidered Saree in a heritage-inspired setting', 0),
    ('organza-embroidered-saree', 'https://images.unsplash.com/photo-1764305066079-3b8af0dbcc67?auto=format&fit=crop&w=1200&h=1500&q=86', 'Organza Embroidered Saree detail and craft', 1),
    ('temple-lakshmi-necklace', 'https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=1200&h=1500&q=86', 'Temple Lakshmi Necklace in a heritage-inspired setting', 0),
    ('temple-lakshmi-necklace', 'https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=1200&h=1500&q=86', 'Temple Lakshmi Necklace detail and craft', 1),
    ('antique-gold-jhumkas', 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=1200&h=1500&q=86', 'Antique Gold Jhumkas in a heritage-inspired setting', 0),
    ('antique-gold-jhumkas', 'https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=1200&h=1500&q=86', 'Antique Gold Jhumkas detail and craft', 1),
    ('kundan-bridal-choker', 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=1200&h=1500&q=86', 'Kundan Bridal Choker in a heritage-inspired setting', 0),
    ('kundan-bridal-choker', 'https://images.unsplash.com/photo-1742891603547-950f510710d7?auto=format&fit=crop&w=1200&h=1500&q=86', 'Kundan Bridal Choker detail and craft', 1),
    ('meenakari-kada-set', 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1200&h=1500&q=86', 'Meenakari Kada Set in a heritage-inspired setting', 0),
    ('meenakari-kada-set', 'https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=1200&h=1500&q=86', 'Meenakari Kada Set detail and craft', 1),
    ('ivory-silk-blouse', 'https://images.unsplash.com/photo-1760461805697-7aff3e93c5d9?auto=format&fit=crop&w=1200&h=1500&q=86', 'Ivory Silk Blouse in a heritage-inspired setting', 0),
    ('ivory-silk-blouse', 'https://images.unsplash.com/photo-1764305066079-3b8af0dbcc67?auto=format&fit=crop&w=1200&h=1500&q=86', 'Ivory Silk Blouse detail and craft', 1),
    ('mirror-work-kurta', 'https://images.unsplash.com/photo-1771507056806-10cb8c81464c?auto=format&fit=crop&w=1200&h=1500&q=86', 'Mirror Work Kurta in a heritage-inspired setting', 0),
    ('mirror-work-kurta', 'https://images.unsplash.com/photo-1764305066079-3b8af0dbcc67?auto=format&fit=crop&w=1200&h=1500&q=86', 'Mirror Work Kurta detail and craft', 1),
    ('silk-potli-bag', 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&h=1500&q=86', 'Silk Potli Bag in a heritage-inspired setting', 0),
    ('silk-potli-bag', 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=1200&h=1500&q=86', 'Silk Potli Bag detail and craft', 1),
    ('jade-velvet-clutch', 'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=1200&h=1500&q=86', 'Jade Velvet Clutch in a heritage-inspired setting', 0),
    ('jade-velvet-clutch', 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=1200&h=1500&q=86', 'Jade Velvet Clutch detail and craft', 1),
    ('jhumka-kamarbandh', 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=1200&h=1500&q=86', 'Jhumka Kamarbandh in a heritage-inspired setting', 0),
    ('jhumka-kamarbandh', 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=1200&h=1500&q=86', 'Jhumka Kamarbandh detail and craft', 1),
    ('herbal-face-oil', 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=1200&h=1500&q=86', 'Sandalwood & Rose Face Oil in a heritage-inspired setting', 0),
    ('herbal-face-oil', 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1200&h=1500&q=86', 'Sandalwood & Rose Face Oil detail and craft', 1),
    ('madder-lipstick', 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&h=1500&q=86', 'Madder & Rose Lipstick in a heritage-inspired setting', 0),
    ('madder-lipstick', 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1200&h=1500&q=86', 'Madder & Rose Lipstick detail and craft', 1),
    ('noor-attar', 'https://images.unsplash.com/photo-1612817288484-6f916006741a?auto=format&fit=crop&w=1200&h=1500&q=86', 'Noor Attar in a heritage-inspired setting', 0),
    ('noor-attar', 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1200&h=1500&q=86', 'Noor Attar detail and craft', 1),
    ('royal-wedding-hamper', 'https://images.unsplash.com/photo-1512909006721-3d6018887383?auto=format&fit=crop&w=1200&h=1500&q=86', 'Royal Wedding Hamper in a heritage-inspired setting', 0),
    ('royal-wedding-hamper', 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=1200&h=1500&q=86', 'Royal Wedding Hamper detail and craft', 1)
), resolved AS (
  SELECT g.*, p.id AS product_id
  FROM gallery g
  JOIN products p ON p.slug = g.product_slug
), deleted AS (
  DELETE FROM product_images pi
  USING products p
  WHERE p.id = pi.product_id
    AND p.slug IN (SELECT DISTINCT product_slug FROM gallery)
)
INSERT INTO product_images (product_id, url, alt, position)
SELECT product_id, url, alt, position FROM resolved
ORDER BY product_id, position;

UPDATE products p
SET image_url = cover.url, updated_at = NOW()
FROM (
  SELECT DISTINCT ON (product_id) product_id, url
  FROM product_images
  ORDER BY product_id, position, created_at
) AS cover
WHERE cover.product_id = p.id;

-- ---------------------------------------------------------------------------
-- Demo customer accounts
--
-- Password for all of these is "Shoba@2026" (documented in the README).
-- The admin account is created by scripts/seed.js from environment variables.
-- ---------------------------------------------------------------------------
INSERT INTO users (name, email, password_hash, role, city, initials)
VALUES
  ('Meera Chen', 'meera@example.com', '$2b$12$7f7.vzTpCCrwtmF9TVkVPOdPkxEhyjpMU6OfeofGWt6IGxrQsN/du', 'customer', 'Bengaluru', 'MC'),
  ('Jon Bell', 'jon.bell@example.com', '$2b$12$7f7.vzTpCCrwtmF9TVkVPOdPkxEhyjpMU6OfeofGWt6IGxrQsN/du', 'customer', 'Mumbai', 'JB'),
  ('Aisha Patel', 'aisha.patel@example.com', '$2b$12$7f7.vzTpCCrwtmF9TVkVPOdPkxEhyjpMU6OfeofGWt6IGxrQsN/du', 'customer', 'Chennai', 'AP'),
  ('Northline Studio', 'orders@northlinestudio.co', '$2b$12$7f7.vzTpCCrwtmF9TVkVPOdPkxEhyjpMU6OfeofGWt6IGxrQsN/du', 'customer', 'Delhi', 'NS'),
  ('Elena Rossi', 'elena.rossi@example.com', '$2b$12$7f7.vzTpCCrwtmF9TVkVPOdPkxEhyjpMU6OfeofGWt6IGxrQsN/du', 'customer', 'Pune', 'ER')
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  city = EXCLUDED.city,
  initials = EXCLUDED.initials,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Demo orders
--
-- Totals are derived from the line items so the order header, the item
-- snapshots, and the shipping/handling rules can never drift apart.
-- Re-seeding replaces the demo orders rather than duplicating them.
-- ---------------------------------------------------------------------------
DELETE FROM orders WHERE order_number IN ('SC-10482', 'SC-10481', 'SC-10479', 'SC-10476', 'SC-10472');

WITH order_seed(order_number, user_email, status, channel, city, state, pincode,
                 shipping_name, phone, payment_method, shipping_method, created_at) AS (
  VALUES
    ('SC-10482', 'meera@example.com',        'processing', 'online_store', 'Bengaluru', 'Karnataka',  '560001', 'Meera Chen',     '+91 98765 43210', 'upi',  'standard', NOW() - INTERVAL '2 hours'),
    ('SC-10481', 'jon.bell@example.com',     'packed',     'online_store', 'Mumbai',    'Maharashtra','400001', 'Jon Bell',       '+91 98765 43211', 'upi',  'standard', NOW() - INTERVAL '5 hours'),
    ('SC-10479', 'aisha.patel@example.com',  'shipped',    'online_store', 'Chennai',   'Tamil Nadu', '600001', 'Aisha Patel',    '+91 98765 43212', 'card', 'express',  NOW() - INTERVAL '1 day'),
    ('SC-10476', 'orders@northlinestudio.co','processing', 'wholesale',    'Delhi',     'Delhi',      '110001', 'Northline Studio','+91 98765 43213', 'cod',  'standard', NOW() - INTERVAL '1 day'),
    ('SC-10472', 'elena.rossi@example.com',  'delivered',  'online_store', 'Pune',      'Maharashtra','411001', 'Elena Rossi',    '+91 98765 43214', 'card', 'standard', NOW() - INTERVAL '28 days')
), line_seed(order_number, product_slug, quantity, selected_color, selected_size) AS (
  VALUES
    ('SC-10482', 'kanjeevaram-silk-saree', 1, 'Deep Maroon', '5.5 m'),
    ('SC-10482', 'antique-gold-jhumkas',  1, 'Antique Gold', NULL),
    ('SC-10481', 'temple-lakshmi-necklace',1, 'Antique Gold', '16-18 in'),
    ('SC-10479', 'banarasi-zari-saree',   1, 'Deep Wine',    '6.2 m'),
    ('SC-10479', 'meenakari-kada-set',    1, 'Emerald',      '2.4 in'),
    ('SC-10479', 'madder-lipstick',       1, 'Madder',       'One size'),
    ('SC-10476', 'royal-wedding-hamper',  4, 'Burgundy & Gold', 'One size'),
    ('SC-10476', 'kundan-bridal-choker',  2, 'Ruby',         '14-16 in'),
    ('SC-10476', 'ivory-silk-blouse',     4, 'Ivory',        '36'),
    ('SC-10476', 'madder-lipstick',       2, 'Rosewood',     'One size'),
    ('SC-10472', 'antique-gold-jhumkas',  1, 'Antique Gold', NULL)
), priced AS (
  SELECT
    ls.order_number,
    ls.product_slug,
    ls.quantity,
    ls.selected_color,
    ls.selected_size,
    p.id AS product_id,
    p.sku,
    p.name AS product_name,
    p.price AS unit_price,
    p.price * ls.quantity AS line_total
  FROM line_seed ls
  JOIN products p ON p.slug = ls.product_slug
), totals AS (
  SELECT order_number, SUM(line_total) AS subtotal, SUM(quantity) AS item_count
  FROM priced
  GROUP BY order_number
), inserted AS (
  INSERT INTO orders (
    user_id, order_number, status, channel,
    shipping_city, shipping_state, shipping_pincode, shipping_phone,
    shipping_name, shipping_email, shipping_address, payment_method, shipping_method,
    payment_status,
    subtotal, shipping_cost, handling_fee, total, item_count, created_at
  )
  SELECT
    u.id,
    os.order_number,
    os.status,
    os.channel,
    os.city,
    os.state,
    os.pincode,
    os.phone,
    os.shipping_name,
    os.user_email,
    os.shipping_name || ', ' || os.city || ', ' || os.state || ' ' || os.pincode,
    os.payment_method,
    os.shipping_method,
    -- Mirrors the API rule: cash on delivery is collected after dispatch, so it
    -- is still outstanding when the order is placed.
    CASE WHEN os.payment_method = 'cod' THEN 'pending' ELSE 'paid' END,
    t.subtotal,
    CASE
      WHEN os.channel = 'wholesale' THEN 0
      WHEN os.shipping_method = 'express' THEN 599
      WHEN t.subtotal >= 9999 THEN 0
      ELSE 299
    END,
    CASE WHEN os.payment_method = 'cod' AND os.channel <> 'wholesale' THEN 50 ELSE 0 END,
    t.subtotal
      + CASE
          WHEN os.channel = 'wholesale' THEN 0
          WHEN os.shipping_method = 'express' THEN 599
          WHEN t.subtotal >= 9999 THEN 0
          ELSE 299
        END
      + CASE WHEN os.payment_method = 'cod' AND os.channel <> 'wholesale' THEN 50 ELSE 0 END,
    t.item_count,
    os.created_at
  FROM order_seed os
  JOIN totals t ON t.order_number = os.order_number
  JOIN users u ON u.email = os.user_email
  RETURNING id, order_number
)
INSERT INTO order_items (
  order_id, product_id, product_name, sku, image_url, selected_color, selected_size,
  unit_price, quantity, line_total
)
SELECT
  i.id,
  pr.product_id,
  pr.product_name,
  pr.sku,
  (SELECT url FROM product_images pi WHERE pi.product_id = pr.product_id ORDER BY pi.position LIMIT 1),
  pr.selected_color,
  pr.selected_size,
  pr.unit_price,
  pr.quantity,
  pr.line_total
FROM priced pr
JOIN inserted i ON i.order_number = pr.order_number;

-- Keep the order-number sequence ahead of every seeded and generated order.
SELECT setval(
  'order_number_seq',
  GREATEST(COALESCE((SELECT MAX(SUBSTRING(order_number FROM 4)::int) FROM orders), 10482), 10482)
);

-- Opening stock levels, recorded as a baseline movement so the inventory
-- history for the seeded catalogue is auditable rather than empty.
INSERT INTO inventory_movements (product_id, delta, previous_stock, resulting_stock, reason, note)
SELECT p.id, p.stock, 0, p.stock, 'seed', 'Initial catalogue seed'
FROM products p
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_movements m WHERE m.product_id = p.id
);
