

import { Video, VideoType } from './types';

const CLOUD_NAME = 'dlrvn33p0'.trim();
const COMMON_TAG = 'hadiqa_v4';

const TARGET_CATEGORIES = [
  'هجمات مرعبة',
  'رعب حقيقي',
  'رعب الحيوانات',
  'أخطر المشاهد',
  'أهوال مرعبة',
  'رعب كوميدي',
  'لحظات مرعبة',
  'صدمه'
];

export const fetchCloudinaryVideos = async (): Promise<Video[]> => {
  try {
    const timestamp = new Date().getTime();
    const targetUrl = `https://res.cloudinary.com/${CLOUD_NAME}/video/list/${COMMON_TAG}.json?t=${timestamp}`;
    
    const response = await fetch(targetUrl, {
      method: 'GET',
      mode: 'cors'
    });

    if (!response.ok) {
      console.error(`Cloudinary Fetch Failed: Status ${response.status}. Make sure "Resource List" is enabled in Cloudinary Security settings.`);
      const cached = localStorage.getItem('app_videos_cache');
      return cached ? JSON.parse(cached) : [];
    }

    const data = await response.json();
    const resources = data.resources || [];
    
    return mapCloudinaryData(resources);
  } catch (error) {
    console.error('Network Error fetching from Cloudinary:', error);
    const cached = localStorage.getItem('app_videos_cache');
    return cached ? JSON.parse(cached) : [];
  }
};

const mapCloudinaryData = (resources: any[]): Video[] => {
  const mapped = resources.map((res: any, index: number) => {
    const isShort = res.height > res.width;
    const videoTypeStr: VideoType = isShort ? 'Shorts' : 'Long Video';
    const typeValue: 'short' | 'long' = isShort ? 'short' : 'long';

    const baseUrl = `https://res.cloudinary.com/${CLOUD_NAME}/video/upload`;
    const optimizedUrl = `${baseUrl}/q_auto,f_auto/v${res.version}/${res.public_id}.${res.format}`;
    const posterUrl = `${baseUrl}/q_auto,f_auto,so_0/v${res.version}/${res.public_id}.jpg`;
    
    const assignedCategory = TARGET_CATEGORIES[index % TARGET_CATEGORIES.length];
    const title = res.context?.custom?.caption || `فيديو ${assignedCategory} رقم ${index + 1}`;

    // Fix: Ensure all required fields for Video interface are present and consistent with component usage
    return {
      id: res.public_id,
      public_id: res.public_id,
      video_url: optimizedUrl,
      poster_url: posterUrl,
      type: typeValue,
      video_type: videoTypeStr,
      title: title,
      description: "",
      likes: 0,
      views: 0,
      category: assignedCategory,
      created_at: res.created_at,
      isFeatured: false,
      is_trending: false,
      tags: []
    } as Video;
  });

  localStorage.setItem('app_videos_cache', JSON.stringify(mapped));
  return mapped;
};

export const deleteCloudinaryVideo = async (publicId: string) => {
  console.warn("Delete requires Admin API credentials.");
  return false;
};

export const updateCloudinaryMetadata = async (publicId: string, title: string, category: string) => {
  console.warn("Update requires Admin API credentials.");
  return false;
};
