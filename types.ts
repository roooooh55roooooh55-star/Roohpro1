export type VideoType = "Shorts" | "Long Video";

export interface Video {
  id: string;
  // Added: public_id to support Cloudinary resource tracking in AdminDashboard
  public_id?: string;      
  title: string;
  description: string;    // السرد المرعب الذي يظهر تحت العنوان
  category: string;       // الأقسام الثمانية المعتمدة
  is_trending: boolean;   // المسؤول عن ظهور رسمة النار الأصلية
  // Added: isFeatured used for trending/featured selection logic
  isFeatured?: boolean;   
  video_url: string;      // رابط R2 السريع (pub-...)
  video_type: VideoType;  // Shorts أو Long Video
  // Added: type used as a lowercase variant for layout and player logic
  type?: 'short' | 'long'; 
  redirect_url?: string;  // الرابط الخارجي المخصص للانتقال
  // Added: external_link alias used in the Admin dashboard editor
  external_link?: string;  
  created_at: any;        // Firestore Timestamp or Date object
  likes?: number;
  views?: number;
  poster_url?: string;
  // Added: tags array for AI-driven categorization and search
  tags?: string[];        
}

export interface UserInteractions {
  likedIds: string[];
  dislikedIds: string[];
  savedIds: string[];
  savedCategoryNames: string[]; 
  watchHistory: { id: string; progress: number }[];
  downloadedIds: string[];
}

export enum AppView {
  HOME = 'home',
  TREND = 'trend',
  LIKES = 'likes',
  SAVED = 'saved',
  UNWATCHED = 'unwatched',
  HIDDEN = 'hidden',
  PRIVACY = 'privacy',
  ADMIN = 'admin',
  CATEGORY = 'category',
  OFFLINE = 'offline'
}