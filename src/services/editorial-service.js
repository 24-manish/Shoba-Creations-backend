import { AppError } from '../middleware/async-handler.js';
import * as repository from '../repositories/editorial-repository.js';

/**
 * Editorial content is read-only as far as the storefront is concerned, so this
 * layer stays thin: it applies the defaults the repository should not have to
 * guess, and leaves publication filtering where it already lives.
 */

export const listStories = ({ limit } = {}) => repository.listPublishedStories({ limit });

export const getStory = async (slug) => {
  const story = await repository.findPublishedStoryBySlug(slug);

  if (!story) {
    throw new AppError(404, 'That story could not be found', 'STORY_NOT_FOUND');
  }

  return story;
};

export const listTestimonials = ({ limit } = {}) => repository.listPublishedTestimonials({ limit });

/**
 * The brand images come back keyed by name. The four the homepage needs are
 * always present, but a missing key must not throw: an unconfigured image is a
 * layout problem for the page to handle, not a failed request.
 */
export const listSiteImages = async () => {
  const images = await repository.listActiveSiteImages();

  return {
    hero: images.hero ?? null,
    heroSecondary: images.hero_secondary ?? null,
    palace: images.palace ?? null,
    palaceSecondary: images.palace_secondary ?? null,
  };
};

/** Everything the homepage needs, in one round trip. */
export const getHomepageContent = async () => {
  const [stories, testimonials, images] = await Promise.all([
    listStories({ limit: 6 }),
    listTestimonials({ limit: 6 }),
    listSiteImages(),
  ]);

  return { stories, testimonials, images };
};
