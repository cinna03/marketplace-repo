import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { ApiError } from '../common/errors';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class WallPhotoService {
  constructor(private readonly config: ConfigService) {}

  async save(userId: string, file?: { buffer?: Buffer; mimetype?: string }): Promise<{ url: string }> {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID') || '';
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL') || '';
    const privateKey = (this.config.get<string>('FIREBASE_PRIVATE_KEY') || '').replace(/\\n/g, '\n');
    const bucketName = this.config.get<string>('FIREBASE_STORAGE_BUCKET') || '';
    if (!projectId || !clientEmail || !privateKey || !bucketName) {
      throw new ApiError(503, 'PHOTOS_NOT_CONFIGURED', 'Wall photos are not connected to Firebase yet.');
    }
    if (!file?.buffer?.length) throw new ApiError(400, 'PHOTO_REQUIRED', 'Choose a photo.');
    if (!file.mimetype || !ALLOWED.has(file.mimetype)) {
      throw new ApiError(400, 'PHOTO_TYPE', 'Use a JPEG, PNG, or WebP photo.');
    }
    if (file.buffer.length > 5 * 1024 * 1024) throw new ApiError(400, 'PHOTO_TOO_LARGE', 'Use a photo under 5 MB.');

    if (!getApps().length) {
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        storageBucket: bucketName,
      });
    }

    const token = randomUUID();
    const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const stored = getStorage().bucket(bucketName).file(`wall-tries/${userId}/${token}.${ext}`);
    await stored.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(stored.name)}?alt=media&token=${token}`;
    return { url };
  }
}
