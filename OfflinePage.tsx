
import React, { useMemo, useState } from 'react';
import { Video, UserInteractions } from './types';
import { removeVideoFromCache } from './offlineManager';

interface OfflinePageProps {
  allVideos: Video[];
  interactions: UserInteractions;
  onPlayShort: (v: Video, list: Video[]) => void;
  onPlayLong: (v: Video) => void;
  onBack: () => void;
  onUpdateInteractions: (p: (prev: UserInteractions) => UserInteractions) => void;
}

const OfflinePage: React.FC<OfflinePageProps> = ({ 
  allVideos, interactions, onPlayShort, onPlayLong, onBack, onUpdateInteractions 
}) => {
  const downloadedVideos = useMemo(() => {
    return allVideos.filter(v => interactions.downloadedIds?.includes(v.id));
  }, [allVideos, interactions.downloadedIds]);

  const handleDelete = async (e: React.MouseEvent, video: Video) => {
    e.stopPropagation();
    if (window.confirm('هل تريد حذف هذا الفيديو من الخزنة؟')) {
      await removeVideoFromCache(video.video_url);
      onUpdateInteractions(prev => ({
        ...prev,
        downloadedIds: prev.downloadedIds.filter(id => id !== video.id)
      }));
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-40 animate-in fade-in duration-500" dir="rtl">
      <header className="p-6 rounded-[2.5rem] bg-neutral-900 border border-white/5 shadow-2xl flex items-center justify-between">
        <div>
           <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Storage Partition</span>
           <h1 className="text-3xl font-black italic text-white">خزنة الرعب</h1>
           <p className="text-[8px] text-gray-500 mt-1 uppercase font-bold tracking-tighter">{downloadedVideos.length} فيديوهات مؤرشفة محلياً</p>
        </div>
        <button onClick={onBack} className="p-3 bg-black/40 border border-white/20 rounded-2xl text-white active:scale-75 transition-transform">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg>
        </button>
      </header>

      {downloadedVideos.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 px-2">
          {downloadedVideos.map((video) => (
            <div 
              key={video.id} 
              onClick={() => video.type === 'short' ? onPlayShort(video, downloadedVideos.filter(v => v.type === 'short')) : onPlayLong(video)}
              className="flex flex-col gap-2 group cursor-pointer active:scale-95 transition-transform relative"
            >
              <div className={`relative rounded-3xl overflow-hidden border border-white/5 bg-neutral-900 ${video.type === 'short' ? 'aspect-[9/16]' : 'aspect-video'}`}>
                <video src={video.video_url} muted autoPlay loop playsInline className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                
                <button 
                  onClick={(e) => handleDelete(e, video)}
                  className="absolute top-2 left-2 p-2 bg-red-600/80 rounded-xl text-white border border-red-400 z-30"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>

                <div className="absolute bottom-3 right-3 left-3">
                   <p className="text-[9px] font-black text-white line-clamp-1 italic text-right leading-tight">{video.title}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-32 opacity-30 gap-6">
          <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="1" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/></svg>
          <p className="font-black italic">خزنتك فارغة من الأرواح..</p>
        </div>
      )}
    </div>
  );
};

export default OfflinePage;
