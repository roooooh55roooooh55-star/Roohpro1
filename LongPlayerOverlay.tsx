
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Video } from './types';
import { incrementViewsInDB } from './supabaseClient';
import { getDeterministicStats, formatBigNumber, LOGO_URL, InteractiveMarquee, NeonTrendBadge } from './MainContent';
import { playNarrative, stopCurrentNarrative } from './elevenLabsManager';

interface LongPlayerOverlayProps {
  video: Video;
  allLongVideos: Video[];
  onClose: () => void;
  onLike: () => void;
  onDislike: () => void;
  onSave: () => void;
  onSwitchVideo: (v: Video) => void;
  onCategoryClick: (cat: string) => void;
  onDownload: () => void;
  isLiked: boolean;
  isDisliked: boolean;
  isSaved: boolean;
  isDownloaded: boolean;
  isGlobalDownloading: boolean;
  onProgress: (p: number) => void;
}

// Neon Styles Configuration for Narrative
const NARRATIVE_STYLES = [
    { border: 'border-red-500', shadow: 'shadow-[0_0_20px_#ef4444]', dot: 'bg-red-500', text: 'text-white' },
    { border: 'border-cyan-400', shadow: 'shadow-[0_0_20px_#22d3ee]', dot: 'bg-cyan-400', text: 'text-cyan-50' },
    { border: 'border-purple-500', shadow: 'shadow-[0_0_20px_#a855f7]', dot: 'bg-purple-500', text: 'text-purple-50' },
    { border: 'border-yellow-400', shadow: 'shadow-[0_0_20px_#facc15]', dot: 'bg-yellow-400', text: 'text-yellow-50' },
    { border: 'border-emerald-500', shadow: 'shadow-[0_0_20px_#10b981]', dot: 'bg-emerald-500', text: 'text-emerald-50' },
    { border: 'border-pink-500', shadow: 'shadow-[0_0_20px_#ec4899]', dot: 'bg-pink-500', text: 'text-pink-50' },
];

const DynamicCaptions: React.FC<{ text: string, isActive: boolean }> = ({ text, isActive }) => {
    const [currentChunk, setCurrentChunk] = useState('');
    const [isVisible, setIsVisible] = useState(false);
    const [currentStyle, setCurrentStyle] = useState(NARRATIVE_STYLES[0]);
    const chunkIndex = useRef(0);
    
    const chunks = useMemo(() => {
      if (!text) return [];
      const words = text.split(/\s+/);
      const result = [];
      for (let i = 0; i < words.length; i += 4) {
        result.push(words.slice(i, i + 4).join(' '));
      }
      return result;
    }, [text]);
  
    useEffect(() => {
      if (!isActive || chunks.length === 0) {
        setIsVisible(false);
        return;
      }
  
      chunkIndex.current = 0;
      
      const showNextChunk = () => {
        if (chunkIndex.current >= chunks.length) {
          setIsVisible(false);
          return;
        }
  
        // Change style randomly for each chunk for a dazzling effect
        const randomStyle = NARRATIVE_STYLES[Math.floor(Math.random() * NARRATIVE_STYLES.length)];
        setCurrentStyle(randomStyle);

        setCurrentChunk(chunks[chunkIndex.current]);
        setIsVisible(true);
  
        setTimeout(() => {
          setIsVisible(false);
          setTimeout(() => {
            chunkIndex.current++;
            showNextChunk();
          }, 300);
        }, 2500); 
      };
  
      showNextChunk();
    }, [chunks, isActive]);
  
    if (chunks.length === 0) return null;
  
    return (
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[100] w-full max-w-[90%] pointer-events-none flex flex-col items-center justify-center text-center">
        <div 
          className={`transition-all duration-500 ease-in-out transform ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'}`}
        >
           <div className={`bg-black/70 backdrop-blur-md border-2 px-6 py-3 rounded-2xl flex items-center justify-center gap-3 transition-colors duration-300 ${currentStyle.border} ${currentStyle.shadow}`}>
             <div className={`w-2 h-2 rounded-full animate-pulse shadow-[0_0_10px_currentColor] ${currentStyle.dot}`}></div>
             <span className={`text-xl md:text-2xl font-black italic drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] leading-relaxed tracking-wide ${currentStyle.text}`}>
                {currentChunk}
             </span>
           </div>
        </div>
      </div>
    );
};

const LongPlayerOverlay: React.FC<LongPlayerOverlayProps> = ({ 
  video, allLongVideos, onClose, onLike, onDislike, onSave, onSwitchVideo, onCategoryClick, onDownload, isLiked, isDisliked, isSaved, isDownloaded, isGlobalDownloading, onProgress 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isAutoPlay, setIsAutoPlay] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const stats = useMemo(() => video ? getDeterministicStats(video.video_url) : { views: 0, likes: 0 }, [video?.video_url]);
  const suggestions = useMemo(() => allLongVideos.filter(v => v && v.id !== video?.id && v.video_type === 'Long Video'), [allLongVideos, video]);

  // Audio Management on Mount/Unmount/Switch
  useEffect(() => {
      // Stop old narrative immediately when this component mounts or video changes
      stopCurrentNarrative();

      if (video && video.read_narrative) {
          const textToRead = video.description || video.title;
          if (textToRead) {
             // Delay slightly to allow video load
             setTimeout(() => playNarrative(textToRead), 500);
          }
      }

      return () => {
          stopCurrentNarrative();
      };
  }, [video?.id]);

  useEffect(() => {
    if (!video) return;
    const v = videoRef.current;
    if (!v) return;
    incrementViewsInDB(video.id);
    v.load();
    v.play().then(() => setIsPlaying(true)).catch(() => {
      v.muted = true;
      v.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    });
  }, [video?.id]);

  useEffect(() => {
    if (!video) return;
    const v = videoRef.current;
    if (!v) return;
    const handleEnd = () => { if (isAutoPlay && suggestions.length > 0) onSwitchVideo(suggestions[0]); };
    const onPlayEvent = () => setIsPlaying(true);
    const onPauseEvent = () => setIsPlaying(false);
    const onLoadedMetadata = () => setDuration(v.duration);
    const onTimeUpdate = () => { 
      setCurrentTime(v.currentTime);
      if (v.duration) onProgress(v.currentTime / v.duration); 
    };
    v.addEventListener('ended', handleEnd);
    v.addEventListener('play', onPlayEvent);
    v.addEventListener('pause', onPauseEvent);
    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('loadedmetadata', onLoadedMetadata);
    return () => {
      v.removeEventListener('ended', handleEnd);
      v.removeEventListener('play', onPlayEvent);
      v.removeEventListener('pause', onPauseEvent);
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [video?.id, isAutoPlay, suggestions, onSwitchVideo, onProgress]);

  const toggleFullScreen = () => {
    if (!containerRef.current) return;
    if (!isFullScreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
    setIsFullScreen(!isFullScreen);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) videoRef.current.currentTime = time;
  };

  const handleLogoClick = () => {
    if (video.redirect_url) {
      window.open(video.redirect_url, '_blank');
    } else {
      stopCurrentNarrative();
      onClose();
    }
  };

  const handleClose = () => {
      stopCurrentNarrative();
      onClose();
  };

  if (!video) return null;

  return (
    <div ref={containerRef} className="fixed inset-0 bg-black z-[500] flex flex-col overflow-hidden" dir="rtl">
      <div 
        className={`relative bg-black transition-all duration-700 ease-in-out flex flex-col items-center justify-center overflow-hidden ${isFullScreen ? 'h-full flex-grow' : 'h-[35dvh] border-b-2 border-white/10 shadow-2xl landscape:h-full'}`}
      >
        <video 
          ref={videoRef} 
          src={video.video_url} 
          className={`transition-all duration-700 h-full w-full object-contain opacity-100 contrast-110 saturate-125 ${isFullScreen ? 'rotate-90 scale-[1.65]' : 'rotate-0'}`} 
          playsInline 
          crossOrigin="anonymous"
          preload="metadata"
          onClick={() => isPlaying ? videoRef.current?.pause() : videoRef.current?.play()}
        />

        <div className={`absolute ${isFullScreen ? 'top-10 left-10' : 'top-16 left-2'} z-40`}>
          <NeonTrendBadge is_trending={video.is_trending} />
        </div>

        <DynamicCaptions text={video.description} isActive={isPlaying} />

        <div className="absolute bottom-0 left-0 w-full px-2 pb-1 z-50">
           <input 
             type="range" 
             min="0" 
             max={duration || 0} 
             step="0.1" 
             value={currentTime}
             onChange={handleSeek}
             className="w-full accent-red-600 h-1 bg-white/20 rounded-lg cursor-pointer appearance-none shadow-[0_0_10px_red]"
           />
        </div>

        <div className={`absolute top-5 left-5 right-5 flex justify-between items-start z-50 transition-opacity duration-500 ${isFullScreen ? 'opacity-30 hover:opacity-100' : 'opacity-100'}`}>
          <button onClick={handleClose} className="p-3.5 bg-black/60 rounded-2xl border-2 border-red-600 text-red-600 shadow-[0_0_20px_red] active:scale-75 transition-all backdrop-blur-md">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="4"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          
          <button 
            onClick={toggleFullScreen} 
            className={`p-3.5 rounded-2xl border-2 transition-all ${isFullScreen ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_25px_#22d3ee]' : 'bg-black/60 border-white/30 text-white backdrop-blur-md shadow-[0_0_10px_white]'}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              {isFullScreen ? <path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5" className="rotate-180 origin-center"/> : <path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5"/>}
            </svg>
          </button>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto bg-[#020202] p-4 space-y-6 scrollbar-hide ${isFullScreen ? 'hidden' : 'block landscape:hidden'}`}>
          <div className="flex items-center gap-5 bg-white/5 p-4 rounded-[2.5rem] border-2 border-white/10 shadow-2xl">
             
             <div className="relative w-14 h-14 shrink-0 flex items-center justify-center cursor-pointer" onClick={handleLogoClick}>
                <div className="absolute w-full h-full rounded-full border-t-2 border-b-2 border-red-600 border-l-transparent border-r-transparent animate-spin shadow-[0_0_15px_rgba(220,38,38,0.8)]" style={{ animationDuration: '1.5s' }}></div>
                <div className="absolute w-[90%] h-[90%] rounded-full border-l-2 border-r-2 border-yellow-500 border-t-transparent border-b-transparent animate-spin shadow-[0_0_10px_rgba(234,179,8,0.8)]" style={{ animationDirection: 'reverse', animationDuration: '2s' }}></div>
                <div className="relative z-10 w-[85%] h-[85%] rounded-full overflow-hidden border border-white/20 shadow-[0_0_10px_rgba(220,38,38,0.6)]">
                   <img src={LOGO_URL} className="w-full h-full object-cover opacity-90" alt="Logo" />
                </div>
                {video.redirect_url && <div className="absolute -top-1 -left-1 bg-red-600 text-[8px] p-1 rounded-full border border-white animate-ping z-20"></div>}
             </div>

             <div className="flex flex-col text-right flex-1 overflow-hidden">
                <h1 className="text-xl font-black text-white leading-tight line-clamp-2 italic drop-shadow-md">{video.title}</h1>
                {video.description && <p className="text-white/60 text-[10px] mt-1 line-clamp-2 italic">{video.description}</p>}
                <div className="flex items-center gap-3.5 mt-2">
                   <button onClick={() => onCategoryClick(video.category)} className="bg-red-600/80 border-2 border-red-400 px-4 py-0.5 rounded-full active:scale-95 transition-transform shadow-[0_0_12px_red]">
                     <span className="text-[10px] font-black text-white italic tracking-tighter uppercase">{video.category}</span>
                   </button>
                   <span className="text-[10px] font-bold text-gray-500 tracking-tight">{formatBigNumber(stats.views)} مشاهدة</span>
                </div>
             </div>
          </div>

          <div className="grid grid-cols-5 items-center bg-neutral-900/70 p-2.5 rounded-[2.5rem] border-2 border-white/15 gap-2 shadow-2xl">
             <button onClick={() => onLike()} className={`flex flex-col items-center py-3.5 rounded-2xl border-2 transition-all ${isLiked ? 'bg-red-600 border-red-400 text-white shadow-[0_0_20px_red]' : 'border-white/15 bg-white/5 text-gray-400 hover:border-red-600/50'}`}>
               <svg className="w-6 h-6" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
               <span className="text-[7px] mt-1.5 font-black">أعجبني</span>
             </button>
             <button onClick={() => onDislike()} className={`flex flex-col items-center py-3.5 rounded-2xl border-2 transition-all ${isDisliked ? 'bg-orange-600 border-orange-400 text-white shadow-[0_0_20px_orange]' : 'border-white/15 bg-white/5 text-gray-400 hover:border-orange-600/50'}`}>
               <svg className="w-6 h-6 rotate-180" fill={isDisliked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
               <span className="text-[7px] mt-1.5 font-black">كرهت</span>
             </button>
             <button onClick={() => onDownload()} className={`flex flex-col items-center py-3.5 rounded-2xl border-2 transition-all ${isDownloaded ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_20px_#22d3ee]' : 'border-white/15 bg-white/5 text-gray-400 hover:border-cyan-600/50'}`}>
               <svg className={`w-6 h-6 ${isGlobalDownloading ? 'animate-bounce' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/></svg>
               <span className="text-[7px] mt-1.5 font-black">{isDownloaded ? 'محمل' : 'تحميل'}</span>
             </button>
             <button onClick={() => isPlaying ? videoRef.current?.pause() : videoRef.current?.play()} className={`flex flex-col items-center py-3.5 rounded-2xl border-2 transition-all border-red-600 bg-red-600/10 text-red-500`}>
               {isPlaying ? <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
               <span className="text-[7px] mt-1.5 font-black">{isPlaying ? 'إيقاف' : 'تشغيل'}</span>
             </button>
             <button onClick={() => onSave()} className={`flex flex-col items-center py-3.5 rounded-2xl border-2 transition-all ${isSaved ? 'bg-yellow-500 border-yellow-300 text-white shadow-[0_0_20px_yellow]' : 'border-white/15 bg-white/5 text-gray-400 hover:border-yellow-500/50'}`}>
               <svg className="w-6 h-6" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
               <span className="text-[7px] mt-1.5 font-black">حفظ</span>
             </button>
          </div>

          <div className="space-y-4 pt-2">
             <div className="flex items-center gap-2 px-3"><span className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span><h3 className="text-[10px] font-black text-red-600 uppercase italic">عالم الرعب المقترح</h3></div>
             <InteractiveMarquee 
               videos={suggestions} 
               onPlay={(v) => onSwitchVideo(v)} 
               interactions={{likedIds: [], dislikedIds: [], savedIds: [], savedCategoryNames: [], watchHistory: [], downloadedIds: []}}
             />
          </div>

          <div className="space-y-5 pb-24">
             <div className="flex items-center gap-2.5 px-3"><span className="w-2.5 h-2.5 bg-cyan-600 rounded-full animate-pulse shadow-[0_0_12px_#22d3ee]"></span><h3 className="text-[11px] font-black text-cyan-600 uppercase tracking-[0.2em] italic">المزيد في هذا القبو</h3></div>
             <div className="flex flex-col gap-4.5">
               {suggestions.map((s) => s && (
                 <div key={s.id} onClick={() => onSwitchVideo(s)} className={`flex gap-4.5 p-4 bg-white/5 rounded-3xl border-2 active:scale-95 transition-all group hover:bg-white/10 shadow-lg ${s.is_trending ? 'border-red-600 shadow-[0_0_15px_red]' : 'border-white/10'}`}>
                   <div className="w-32 h-18 bg-black rounded-2xl overflow-hidden border-2 border-white/15 shrink-0 relative shadow-xl">
                     <video src={s.video_url} crossOrigin="anonymous" preload="metadata" className="w-full h-full object-cover opacity-100 contrast-110 saturate-125 transition-opacity" />
                   </div>
                   <div className="flex flex-col justify-center flex-1 overflow-hidden text-right">
                     <h4 className="text-[13px] font-black text-white group-hover:text-red-500 transition-colors line-clamp-2 leading-tight italic drop-shadow-sm">{s.title}</h4>
                     <div className="flex items-center justify-between mt-2 flex-row-reverse">
                       <span className="text-[8px] text-red-500 font-black italic uppercase tracking-tighter">{formatBigNumber(getDeterministicStats(s.video_url).views)} VIEWS</span>
                       <span className="text-[8px] text-gray-500 font-bold uppercase">HD HORROR</span>
                     </div>
                   </div>
                 </div>
               ))}
             </div>
          </div>
      </div>
    </div>
  );
};

export default LongPlayerOverlay;
