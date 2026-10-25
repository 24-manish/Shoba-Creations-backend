import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from './async-handler.js';

export const uploadDirectory = path.resolve(process.cwd(), env.uploadDir);

const ALLOWED_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/avif', '.avif']
]);

// Signatures are checked against the declared MIME type so a renamed executable
// cannot be written into the uploads directory.
const SIGNATURES = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/avif', bytes: [0x66, 0x74, 0x79, 0x70] }
];

const matchesSignature = (buffer, mime) => {
  const rule = SIGNATURES.find((candidate) => candidate.mime === mime);

  if (!rule) {
    return true;
  }

  return rule.bytes.every((byte, index) => buffer[index] === byte);
};

export const isWebp = (buffer) =>
  buffer.length >= 12 &&
  buffer.toString('ascii', 0, 4) === 'RIFF' &&
  buffer.toString('ascii', 8, 12) === 'WEBP';

const resolveExtension = (buffer, mime) => {
  if (mime === 'image/webp') {
    return isWebp(buffer) ? '.webp' : null;
  }

  return ALLOWED_TYPES.get(mime) ?? null;
};

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: env.uploadMaxBytes,
    files: env.uploadMaxFiles
  },
  fileFilter: (req, file, callback) => {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      callback(new AppError(415, 'Only JPEG, PNG, WEBP, or AVIF images are allowed', 'UNSUPPORTED_MEDIA_TYPE'));
      return;
    }

    callback(null, true);
  }
});

export const uploadProductImages = upload.array('images', env.uploadMaxFiles);

export const ensureUploadDirectory = () => mkdir(uploadDirectory, { recursive: true });

export const buildStoredFile = (file) => {
  const extension = resolveExtension(file.buffer, file.mimetype);

  if (!extension) {
    throw new AppError(415, 'The file contents do not match a supported image format', 'INVALID_IMAGE');
  }

  if (!matchesSignature(file.buffer, file.mimetype)) {
    throw new AppError(415, 'The file contents do not match a supported image format', 'INVALID_IMAGE');
  }

  // Random names keep user input out of the filesystem path entirely.
  return {
    filename: `${randomUUID()}${extension}`,
    size: file.size,
    originalName: file.originalname
  };
};
