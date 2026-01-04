
import React, { useMemo } from 'react';
import { Video } from './types';

interface CategoryPageProps {
  category: string;
  allVideos: Video[];
  isSaved: boolean;
  onToggleSave: () => void;
  onPlayShort: (v: Video, list: Video[]) => void;
  onPlayLong: (v: Video) => void;
  onBack: () => void;
}

const NeonTrendBadge = ({ isFeatured }: { isFeatured: boolean }) => {
  if (!isFeatured) return null;
  return (
    <div className="absolute top-3 right-3 z-30 flex items-center gap-1 bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg border border-red-600/50 animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.5)]">
      <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 24 24">
        <path d="M17.557 12c0 3.071-2.488 5.557-5.557 5.557s-5.557-2.486-5.557-5.557c0-1.538.625-2.93 1.63-3.935L12 4l3.929 4.065c1.005 1.005 1.628 2.397 1.628 3.935zM12 2C8.134 2 5 5.134 5 9c0 2.38 1.185 4.481 3 5.733V20l4 2 4-2v-5.267c1.815-1.252 3-3.353 3-5.733 0-3.866-3.134-7-7-7z" />
      </svg>
      <span className="text-[10px] font-black text-white italic">TREND</span>
    </div>
  );
};

const CategoryPage: React.FC<CategoryPageProps> = ({ category, allVideos, isSaved, onToggleSave, onPlayShort, onPlayLong, onBack }) => {
  const catVideos = useMemo(() => allVideos.filter(v => v.category === category), [allVideos, category]);

  return (
    <div className="flex flex-col gap-8 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 rounded-[2.5rem] bg-red-600/10 border border-red-600/30 shadow-2xl relative overflow-hidden">
        <div className="absolute top-4 left-4 flex gap-2 z-10">
           <button onClick={onToggleSave} className={`p-2 rounded-full border transition-all active:scale-75 ${isSaved ? 'bg-yellow-500 border-yellow-400 text-white shadow-[0_0_15px_yellow]' : 'bg-black/40 border-white/20 text-white'}`}>
             {isSaved ? (
               <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
             ) : (
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
             )}
           </button>
           <button onClick={onBack} className="p-2 bg-black/40 border border-white/20 rounded-full text-white active:scale-75 transition-transform">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg>
           </button>
        </div>
        
        <div className="relative text-right pr-2">
          <span className="text-[10px] font-black text-red-500 uppercase tracking-widest opacity-60">مستودع الأقسام</span>
          <h1 className="text-3xl font-black italic text-white drop-shadow-lg">{category}</h1>
          <p className="text-[8px] text-gray-500 mt-1 uppercase font-bold tracking-tighter">{catVideos.length} فيديوهات مؤرشفة تحت هذا الوسم</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 px-2">
        {catVideos.map((video) => {
          if (!video || !video.video_url) return null;
          return (
            <div 
              key={video.id} 
              onClick={() => video.video_type === 'Shorts' ? onPlayShort(video, catVideos.filter(v => v.video_type === 'Shorts')) : onPlayLong(video)}
              className="flex flex-col gap-2 group cursor-pointer active:scale-95 transition-transform relative"
            >
              <div className={`relative rounded-3xl overflow-hidden border border-white/5 bg-neutral-900 ${video.video_type === 'Shorts' ? 'aspect-[9/16]' : 'aspect-video'}`}>
                <video 
                  src={video.video_url} 
                  muted autoPlay loop playsInline 
                  crossOrigin="anonymous" 
                  preload="metadata" 
                  className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" 
                />
                
                <NeonTrendBadge isFeatured={video.is_trending} />

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                <div className="absolute bottom-3 right-3 left-3">
                   <p className="text-[9px] font-black text-white line-clamp-1 italic text-right leading-tight">{video.title}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CategoryPage;
