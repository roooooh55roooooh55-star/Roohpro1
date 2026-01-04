
import { Video } from './types';

// هذا الملف تم تعطيله تماماً بناءً على طلب المستخدم.
// النظام يعمل الآن حصرياً على R2 و Firebase.

export const fetchCloudinaryVideos = async (): Promise<Video[]> => {
  console.log("Cloudinary connection is disabled. Using R2 Vault only.");
  return [];
};

export const deleteCloudinaryVideo = async (publicId: string) => {
  return false;
};

export const updateCloudinaryMetadata = async (publicId: string, title: string, category: string) => {
  return false;
};
