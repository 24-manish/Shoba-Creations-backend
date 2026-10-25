import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';

export const s3Client = new S3Client({
  region: env.s3Region,
  endpoint: env.s3Endpoint,
  credentials: {
    accessKeyId: env.supabaseServiceRoleKey,
    secretAccessKey: env.supabaseServiceRoleKey
  }
});

export async function uploadToStorage(key, body, contentType) {
  await s3Client.send(new PutObjectCommand({
    Bucket: env.s3Bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    ACL: 'public-read'
  }));
  return `${env.s3Endpoint}/${env.s3Bucket}/${key}`;
}

export async function deleteFromStorage(key) {
  await s3Client.send(new DeleteObjectCommand({ Bucket: env.s3Bucket, Key: key }));
}