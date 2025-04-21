// src/services/cloudinaryService.ts
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export class CloudinaryService {
  async uploadImageFromBuffer(
    buffer: Buffer,
    filename: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: filename,
          resource_type: 'image',
          folder: 'uploads',
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else if (result?.secure_url) {
            resolve(result.secure_url);
          } else {
            reject(new Error('Unknown upload error'));
          }
        }
      );

      Readable.from(buffer).pipe(stream);
    });
  }
}
