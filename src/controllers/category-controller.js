import { sendData } from '../http.js';
import * as categoryService from '../services/category-service.js';

export const list = async (req, res) => {
  sendData(res, { categories: await categoryService.listWithCounts() });
};
