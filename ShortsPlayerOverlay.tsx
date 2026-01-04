
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Video, UserInteractions } from './types';
import { getDeterministicStats, formatBigNumber, LOGO_URL, formatVideoSource, NeonTrendBadge } from './MainContent';

interface ShortsPlayerOverlayProps {
  initialVideo: Video;
  videoList: Video[];
  interactions: UserInteractions;
  onClose: () => void;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  onCategoryClick: (cat: string) => void;
  onSave: (id: string) => void;
  onProgress: (id: string, progress: number) => void;
  onDownload: (video: Video) => void;
  isGlobalDownloading: boolean;
}

const NeonLionIcon: React.FC<{ colorClass: string, isDownloading: boolean }> = ({ colorClass, isDownloading }) => (
  <svg 
    className={`w-7 h-7 transition-all duration-500 ${colorClass} ${isDownloading ? 'animate-bounce drop-shadow-[0_0_15px_currentColor]' : 'hover:scale-110 drop-shadow-[0_0_5px_currentColor]'}`} 
    viewBox="0 0 24 24" 
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2c-4 0-7 3-7 7 0 2 1 4 2 5-1 1-2 3-2 5 0 2 2 3 4 3h6c2 0 4-1 4-3 0-2-1-4-2-5 1-1 2-3 2-5 0-4-3-7-7-7z" className="opacity-40" />
    <path d="M9 9h.01M15 9h.01M10 13c1 1 3 1 4 0" />
    <path d="M7 11c-1-1-2-1-3 0M17 11c1-1 2-1 3 0" />
    <circle cx="12" cy="12" r="10" className="opacity-20" />
  </svg>
);

const ShortsPlayerOverlay: React.FC<ShortsPlayerOverlayProps> = ({ 
  initialVideo, videoList, interactions, onClose, onLike, onDislike, onCategoryClick, onSave, onProgress, onDownload, isGlobalDownloading
}) => {
  // UseMemo guarantees this randomization runs only once when opened
  const randomizedList = useMemo(() => {
    const otherVideos = videoList.filter(v => v.id !== initialVideo.id);
    // Fisher-Yates shuffle for true randomness
    for (let i = otherVideos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherVideos[i], otherVideos[j]] = [otherVideos[j], otherVideos[i]];
    }
    return [initialVideo, ...otherVideos];
  }, [initialVideo.id, videoList]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});
  const [isBuffering, setIsBuffering] = useState(true);

  // PRELOAD NEXT VIDEOS LOGIC
  // Fetches the first 1.5MB (approx 5-10s) of the next 2 videos to ensure instant playback
  useEffect(() => {
    const preloadNext = async () => {
        const nextIndices = [currentIndex + 1, currentIndex + 2];
        
        for (const idx of nextIndices) {
            if (idx < randomizedList.length) {
                const video = randomizedList[idx];
                const url = formatVideoSource(video);
                try {
                    // This fetches the bytes into the browser disk cache
                    // Next time the video tag requests it, it will be served from cache instantly
                    await fetch(url, {
                        headers: { 'Range': 'bytes=0-1500000' }, // 1.5MB Buffer
                        mode: 'cors'
                    });
                } catch (e) {
                    // Ignore errors, just optimization
                }
            }
        }
    };
    preloadNext();
  }, [currentIndex, randomizedList]);

  const handleNextVideo = useCallback(() => {
    if (currentIndex < randomizedList.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      const container = containerRef.current;
      if (container) {
        container.scrollTo({
          top: nextIdx * container.clientHeight,
          behavior: 'smooth'
        });
      }
    }
  }, [currentIndex, randomizedList.length]);

  useEffect(() => {
    (Object.values(videoRefs.current) as (HTMLVideoElement | null)[]).forEach(v => v?.pause());
    const mainVid = videoRefs.current[`main-${currentIndex}`];
    if (mainVid) {
      setIsBuffering(true);
      mainVid.play().catch(() => { mainVid.muted = true; mainVid.play().catch(() => {}); });
    }
  }, [currentIndex]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const height = e.currentTarget.clientHeight;
    if (height === 0) return;
    const index = Math.round(e.currentTarget.scrollTop / height);
    if (index !== currentIndex && index >= 0 && index < randomizedList.length) {
      setCurrentIndex(index);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-[500] flex flex-col overflow-hidden">
      {/* Updated Close Button Position and Size */}
      <div className="absolute top-5 right-4 z-[600]">
        <button onClick={onClose} className="p-2 rounded-full bg-black/60 backdrop-blur-xl text-red-600 border border-red-600 shadow-[0_0_15px_#dc2626] active:scale-75 transition-all hover:bg-black/80">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div ref={containerRef} onScroll={handleScroll} className="flex-grow overflow-y-scroll snap-y snap-mandatory scrollbar-hide h-full w-full">
        {randomizedList.map((video, idx) => {
          const stats = getDeterministicStats(video.video_url);
          const isLiked = interactions.likedIds.includes(video.id);
          const isDisliked = interactions.dislikedIds.includes(video.id);
          const isSaved = interactions.savedIds.includes(video.id);
          const isDownloaded = interactions.downloadedIds.includes(video.id);
          const isActive = idx === currentIndex;
          const formattedSrc = formatVideoSource(video);

          const lionColor = isDownloaded 
            ? "text-cyan-400 drop-shadow-[0_0_12px_#22d3ee]" 
            : "text-purple-400 drop-shadow-[0_0_8px_#c084fc]";

          return (
            <div key={`${video.id}-${idx}`} className="h-full w-full snap-start relative bg-black flex overflow-hidden">
              <div 
                className="relative h-full w-full cursor-pointer"
                onClick={() => { const v = videoRefs.current[`main-${idx}`]; if(v) v.paused ? v.play() : v.pause(); }}
              >
                <video 
                    ref={el => { videoRefs.current[`main-${idx}`] = el; }}
                    src={formattedSrc} 
                    className={`h-full w-full object-cover transition-opacity duration-500 contrast-110 saturate-125 opacity-100`}
                    playsInline 
                    loop={false} 
                    crossOrigin="anonymous"
                    preload="metadata"
                    onWaiting={() => isActive && setIsBuffering(true)}
                    onPlaying={() => isActive && setIsBuffering(false)}
                    onEnded={() => isActive && handleNextVideo()} 
                    onTimeUpdate={(e) => isActive && onProgress(video.id, e.currentTarget.currentTime / e.currentTarget.duration)}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/60 pointer-events-none" />
                {/* Trend Badge - Inside Shorts Player */}
                <NeonTrendBadge is_trending={video.is_trending} />
              </div>

              {video.redirect_url && (
                <button 
                  onClick={() => window.open(video.redirect_url, '_blank')}
                  className="absolute bottom-32 left-4 p-4 bg-red-600 rounded-2xl text-white font-black shadow-[0_0_30px_rgba(220,38,38,0.8)] flex items-center gap-2 active:scale-95 transition-all animate-bounce z-50 border-2 border-red-400"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  <span className="text-sm">مشاهدة المزيد</span>
                </button>
              )}

              <div className="absolute bottom-24 left-4 flex flex-col items-center gap-5 z-40">
                <div className="flex flex-col items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); onLike(video.id); }} className="group">
                    <div className={`p-3.5 rounded-full border-2 transition-all duration-300 ${isLiked ? 'bg-red-600 border-red-400 text-white shadow-[0_0_20px_#ef4444]' : 'bg-black/40 border-white/20 text-white backdrop-blur-xl hover:border-red-600/50'}`}>
                      <svg className="w-6 h-6" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
                    </div>
                  </button>
                  <span className="text-[9px] font-black text-white drop-shadow-lg">{formatBigNumber(stats.likes)}</span>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); onDislike(video.id); }} className="group">
                    <div className={`p-3.5 rounded-full border-2 transition-all duration-300 ${isDisliked ? 'bg-orange-600 border-orange-400 text-white shadow-[0_0_20px_#ea580c]' : 'bg-black/40 border-white/20 text-white backdrop-blur-xl hover:border-orange-600/50'}`}>
                      <svg className="w-6 h-6 rotate-180" fill={isDisliked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
                    </div>
                  </button>
                  <span className="text-[9px] font-black text-white drop-shadow-lg italic">كرهت</span>
                </div>

                <div className="flex flex-col items-center gap-1 mt-2">
                  <button onClick={(e) => { e.stopPropagation(); onDownload(video); }} className="group">
                    <div className={`p-3 rounded-2xl border-2 transition-all duration-500 bg-black/40 ${isDownloaded ? 'border-cyan-400 shadow-[0_0_20px_#22d3ee]' : 'border-purple-500/30 shadow-[0_0_10px_rgba(192,132,252,0.3)] hover:border-cyan-400/40'}`}>
                      <NeonLionIcon colorClass={lionColor} isDownloading={isGlobalDownloading && isActive} />
                    </div>
                  </button>
                  <span className="text-[8px] font-black text-white uppercase tracking-tighter italic">{isDownloaded ? 'Saved' : 'Vault'}</span>
                </div>

                <button onClick={(e) => { e.stopPropagation(); onSave(video.id); }} className="mt-2 flex flex-col items-center group">
                   <div className={`p-3.5 rounded-full border-2 transition-all duration-300 ${isSaved ? 'bg-yellow-500 border-yellow-300 text-white shadow-[0_0_20px_#facc15]' : 'bg-black/40 border-white/20 text-white backdrop-blur-xl hover:border-yellow-500/50'}`}>
                     <svg className="w-6 h-6" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
                   </div>
                </button>
              </div>

              <div className="absolute bottom-24 right-4 left-24 z-40 text-right">
                <div className="flex flex-col items-end gap-3">
                  <button onClick={(e) => { e.stopPropagation(); onCategoryClick(video.category); }} className="backdrop-blur-xl bg-red-600/70 border-2 border-red-400 px-4 py-1 rounded-full shadow-[0_0_15px_red] active:scale-95 transition-all">
                    <span className="text-[10px] font-black text-white italic uppercase">{video.category}</span>
                  </button>
                  <div className="flex items-center gap-3 flex-row-reverse">
                    <div className="flex flex-col items-end">
                      <h3 className="text-white text-lg font-black drop-shadow-xl leading-tight line-clamp-1 italic">@الحديقة المرعبة</h3>
                      <p className="text-white/80 text-[11px] font-bold italic mt-1 drop-shadow-md">{video.title}</p>
                      {video.description && <p className="text-white/60 text-[9px] font-medium mt-1 drop-shadow-sm max-w-[200px]">{video.description}</p>}
                    </div>
                    <img 
                      src={LOGO_URL} 
                      onClick={(e) => { e.stopPropagation(); onClose(); }}
                      className={`w-12 h-12 rounded-full border-2 border-red-600 shadow-[0_0_20px_red] transition-transform active:scale-90`} 
                      alt="Logo" 
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ShortsPlayerOverlay;
