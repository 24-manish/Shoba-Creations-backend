import { getQuery, sendData } from '../http.js';
import * as editorialService from '../services/editorial-service.js';

export const listStories = async (req, res) => {
  sendData(res, { stories: await editorialService.listStories({ limit: getQuery(req).limit }) });
};

export const getStory = async (req, res) => {
  sendData(res, { story: await editorialService.getStory(req.params.slug) });
};

export const listTestimonials = async (req, res) => {
  sendData(res, { testimonials: await editorialService.listTestimonials({ limit: getQuery(req).limit }) });
};

export const listSiteImages = async (req, res) => {
  sendData(res, { images: await editorialService.listSiteImages() });
};

/** One request for the whole homepage, so it renders in a single pass. */
export const getHomepageContent = async (req, res) => {
  sendData(res, await editorialService.getHomepageContent());
};
