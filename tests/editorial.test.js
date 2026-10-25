import './helpers/env.js';
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { closePool, query } from '../src/db/pool.js';
import { resetDatabase } from './helpers/database.js';
import { startTestServer } from './helpers/server.js';

let harness;
let client;

before(async () => {
  await resetDatabase();
  harness = await startTestServer();
  client = harness.client;
});

after(async () => {
  await harness?.close();
  await closePool();
});

test('the homepage endpoint returns stories, testimonials and brand images together', async () => {
  const res = await client.get('/api/content/home');

  assert.equal(res.status, 200);
  assert.equal(res.data.stories.length, 3);
  assert.equal(res.data.testimonials.length, 3);

  for (const key of ['hero', 'heroSecondary', 'palace', 'palaceSecondary']) {
    assert.ok(key in res.data.images, `missing image key ${key}`);
    assert.ok(res.data.images[key], `${key} was not seeded`);
  }
});

test('a story exposes every documented field', async () => {
  const res = await client.get('/api/content/stories');

  assert.equal(res.status, 200);

  const fields = [
    'id', 'slug', 'title', 'excerpt', 'body', 'imageUrl', 'imageAlt', 'readTime',
    'authorName', 'sortOrder', 'isPublished', 'publishedAt', 'createdAt', 'updatedAt'
  ];

  for (const story of res.data.stories) {
    for (const field of fields) {
      assert.ok(field in story, `${story.title} is missing ${field}`);
    }

    assert.ok(story.isPublished);
    assert.ok(story.publishedAt, 'a published story must carry a publication date');
    assert.ok(story.imageUrl && story.imageAlt);
  }
});

test('stories are ordered newest first', async () => {
  const res = await client.get('/api/content/stories');
  const dates = res.data.stories.map((story) => new Date(story.publishedAt).getTime());

  assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
});

test('the limit is honoured and capped', async () => {
  const limited = await client.get('/api/content/stories?limit=2');
  const rejected = await client.get('/api/content/stories?limit=500');

  assert.equal(limited.status, 200);
  assert.equal(limited.data.stories.length, 2);

  assert.equal(rejected.status, 400);
  assert.equal(rejected.json.error.code, 'VALIDATION_ERROR');
});

test('a single story is retrievable by slug', async () => {
  const res = await client.get('/api/content/stories/the-story-of-the-saree');

  assert.equal(res.status, 200);
  assert.equal(res.data.story.slug, 'the-story-of-the-saree');
  assert.equal(res.data.story.title, 'The Story of the Saree');
  assert.ok(res.data.story.body.length > 100);
});

test('an unknown story slug returns a structured 404', async () => {
  const res = await client.get('/api/content/stories/no-such-story');

  assert.equal(res.status, 404);
  assert.equal(res.json.error.code, 'STORY_NOT_FOUND');
});

test('unpublished stories are invisible to the public endpoints', async () => {
  await query(
    `UPDATE editorial_stories SET is_published = FALSE, published_at = NULL
     WHERE slug = 'the-art-of-temple-jewellery'`
  );

  const list = await client.get('/api/content/stories');
  const direct = await client.get('/api/content/stories/the-art-of-temple-jewellery');
  const home = await client.get('/api/content/home');

  assert.ok(list.data.stories.every((story) => story.slug !== 'the-art-of-temple-jewellery'));
  assert.equal(direct.status, 404);
  assert.ok(home.data.stories.every((story) => story.slug !== 'the-art-of-temple-jewellery'));

  await query(
    `UPDATE editorial_stories SET is_published = TRUE, published_at = NOW()
     WHERE slug = 'the-art-of-temple-jewellery'`
  );
});

test('testimonials expose a rating within the allowed range', async () => {
  const res = await client.get('/api/content/testimonials');

  assert.equal(res.status, 200);

  for (const testimonial of res.data.testimonials) {
    for (const field of ['id', 'name', 'city', 'quote', 'rating', 'imageUrl', 'imageAlt', 'sortOrder', 'isPublished']) {
      assert.ok(field in testimonial, `${testimonial.name} is missing ${field}`);
    }

    assert.ok(testimonial.rating >= 1 && testimonial.rating <= 5);
    assert.ok(testimonial.isPublished);
  }
});

test('a testimonial rating outside 1-5 is refused by the database', async () => {
  await assert.rejects(
    query(
      `INSERT INTO testimonials (name, quote, rating, is_published)
       VALUES ('Out of range', 'Should never be stored', 9, TRUE)`
    ),
    /testimonials_rating_range/
  );
});

test('a published story cannot be stored without a publication date', async () => {
  await assert.rejects(
    query(
      `INSERT INTO editorial_stories (slug, title, excerpt, image_url, is_published, published_at)
       VALUES ('undated', 'Undated', 'A story with no publication date', 'https://example.test/x.jpg', TRUE, NULL)`
    ),
    /editorial_stories_published_at/
  );
});

test('a site image key must be a lowercase identifier', async () => {
  await assert.rejects(
    query(`INSERT INTO site_images (key, url) VALUES ('Hero Primary', 'https://example.test/x.jpg')`),
    /site_images_key_format/
  );
});

test('editorial endpoints do not require a session', async () => {
  client.clearCookies();

  const stories = await client.get('/api/content/stories');
  const testimonials = await client.get('/api/content/testimonials');
  const images = await client.get('/api/content/images');

  assert.equal(stories.status, 200);
  assert.equal(testimonials.status, 200);
  assert.equal(images.status, 200);
});

test('a deactivated site image drops out of the response without failing it', async () => {
  await query(`UPDATE site_images SET is_active = FALSE WHERE key = 'palace'`);

  const res = await client.get('/api/content/images');

  assert.equal(res.status, 200);
  assert.equal(res.data.images.palace, null);
  assert.ok(res.data.images.hero, 'the other images are unaffected');

  await query(`UPDATE site_images SET is_active = TRUE WHERE key = 'palace'`);
});
