import { Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';

@Injectable()
export class ObjectStoreService {
  private readonly appConfig = config();
  private readonly client = this.createClient();

  async signUpload(objectKey: string, sha256: string, size: number): Promise<string | null> {
    if (!this.client) return null;
    const command = new PutObjectCommand({
      Bucket: this.appConfig.S3_BUCKET,
      Key: objectKey,
      ContentLength: size,
      Metadata: { sha256 },
    });
    return getSignedUrl(this.client, command, { expiresIn: 15 * 60 });
  }

  private createClient(): S3Client | null {
    if (
      !this.appConfig.S3_ENDPOINT ||
      !this.appConfig.S3_ACCESS_KEY ||
      !this.appConfig.S3_SECRET_KEY
    ) {
      return null;
    }
    return new S3Client({
      endpoint: this.appConfig.S3_ENDPOINT,
      region: this.appConfig.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.appConfig.S3_ACCESS_KEY,
        secretAccessKey: this.appConfig.S3_SECRET_KEY,
      },
    });
  }
}
