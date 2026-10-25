import { randomUUID } from 'node:crypto';

export const slugify = (value) => {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u030f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || `item-${randomUUID().slice(0, 8)}`;
};

const MAX_SLUG_ATTEMPTS = 50;

/**
 * Produces a slug that no other row is using, appending -2, -3, -4 and so on.
 *
 * The suffix is a counter rather than a random fragment so a shopper who names
 * a product the same as an existing one gets a predictable, shareable URL, and
 * so tests can assert an exact slug instead of matching a pattern.
 *
 * `currentId` is the row being updated; it is allowed to keep its own slug when
 * a name is re-saved unchanged.
 */
export const uniqueSlug = async (value, findBySlug, currentId = null) => {
  const base = slugify(value);

  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    const existing = await findBySlug(candidate);

    if (!existing || existing.id === currentId) {
      return candidate;
    }
  }

  // Fifty collisions on one name means something is wrong upstream; fall back to
  // a random suffix rather than looping forever.
  return `${base}-${randomUUID().slice(0, 8)}`;
};
