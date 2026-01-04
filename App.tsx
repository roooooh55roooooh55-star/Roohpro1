
import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import { Video, AppView, UserInteractions } from './types.ts';
import { db } from './firebaseConfig.ts';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import AppBar from './AppBar.tsx';
import MainContent from './MainContent.tsx';
import { downloadVideoWithProgress, removeVideoFromCache } from './offlineManager.ts';
import { initSmartBuffering } from './smartCache.ts';

const ShortsPlayerOverlay = lazy(() => import('./ShortsPlayerOverlay.tsx'));
const LongPlayerOverlay = lazy(() => import('./LongPlayerOverlay.tsx'));
const AdminDashboard = lazy(() => import('./AdminDashboard.tsx'));
const AIOracle = lazy(() => import('./AIOracle.tsx'));
const TrendPage = lazy(() => import('./TrendPage.tsx'));
const SavedPage = lazy(() => import('./SavedPage.tsx'));
const PrivacyPage = lazy(() => import('./PrivacyPage.tsx'));
const HiddenVideosPage = lazy(() => import('./HiddenVideosPage.tsx'));
const CategoryPage = lazy(() => import('./CategoryPage.tsx'));
const OfflinePage = lazy(() => import('./OfflinePage.tsx'));
const UnwatchedPage = lazy(() => import('./UnwatchedPage.tsx'));

// 1. التصنيفات الرسمية الـ 8 (يجب كتابتها حرفياً)
export const OFFICIAL_CATEGORIES = [
  'هجمات مرعبة', 
  'رعب حقيقي', 
  'رعب الحيوانات', 
  'أخطر المشاهد',
  'أهوال مرعبة', 
  'رعب كوميدي', 
  'لحظات مرعبة', 
  'صدمه'
];

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.HOME);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [rawVideos, setRawVideos] = useState<Video[]>([]); 
  // displayVideos هو القائمة المعروضة، يتم تحديثها فوراً عند تغيير البيانات في القاعدة
  const [displayVideos, setDisplayVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0); 
  
  const [selectedShort, setSelectedShort] = useState<{ video: Video, list: Video[] } | null>(null);
  const [selectedLong, setSelectedLong] = useState<{ video: Video, list: Video[] } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  
  const [downloadProgress, setDownloadProgress] = useState<{id: string, progress: number} | null>(null);

  const isOverlayActive = useMemo(() => !!selectedShort || !!selectedLong, [selectedShort, selectedLong]);

  const [interactions, setInteractions] = useState<UserInteractions>(() => {
    try {
      const saved = localStorage.getItem('al-hadiqa-interactions-v12');
      const data = saved ? JSON.parse(saved) : null;
      return data || { likedIds: [], dislikedIds: [], savedIds: [], savedCategoryNames: [], watchHistory: [], downloadedIds: [] };
    } catch (e) {
      return { likedIds: [], dislikedIds: [], savedIds: [], savedCategoryNames: [], watchHistory: [], downloadedIds: [] };
    }
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // دالة الخلط الذكية
  const shuffleAndBoost = (videos: Video[]) => {
    const shuffled = [...videos].sort(() => Math.random() - 0.5);
    const trending = shuffled.filter(v => v.is_trending);
    const regular = shuffled.filter(v => !v.is_trending);
    return [...trending.slice(0, 3), ...regular, ...trending.slice(3)];
  };

  const handleManualRefresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      // إعادة خلط المحتوى الحالي
      const newOrder = shuffleAndBoost(rawVideos);
      setDisplayVideos(newOrder);
      setRefreshKey(prev => prev + 1);
      setCurrentView(AppView.HOME);
      initSmartBuffering(newOrder);
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 800); 
  }, [rawVideos]);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "videos"), orderBy("created_at", "desc"));
    
    // هذا الجزء يضمن التحديث الفوري عند الإضافة أو الحذف
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const videosList = snapshot.docs.map(doc => {
        const data = doc.data();
        // تنظيف نوع الفيديو لضمان الفصل الصحيح
        let vType = data.video_type;
        if (vType && typeof vType === 'string') {
            vType = vType.trim();
        }
        
        return {
          id: doc.id,
          ...data,
          video_type: vType
        };
      }) as Video[];
      
      // FIX: Filter out videos with no URL immediately to prevent black screens anywhere in the app
      const validVideos = videosList.filter(v => (v.video_url && v.video_url.trim() !== "") || (v.redirect_url && v.redirect_url.trim() !== ""));
      
      setRawVideos(validVideos);
      setDisplayVideos(validVideos);
      
      if (validVideos.length > 0) {
        initSmartBuffering(validVideos);
      }
      
      setLoading(false);
    }, (err) => {
      console.error("Firebase Error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []); 

  useEffect(() => { 
    localStorage.setItem('al-hadiqa-interactions-v12', JSON.stringify(interactions)); 
  }, [interactions]);

  // FIX: Force close players if the video is deleted (to prevent black screen residue)
  useEffect(() => {
    if (selectedShort && !displayVideos.find(v => v.id === selectedShort.video.id)) {
      setSelectedShort(null);
    }
    if (selectedLong && !displayVideos.find(v => v.id === selectedLong.video.id)) {
      setSelectedLong(null);
    }
  }, [displayVideos, selectedShort, selectedLong]);

  const handleLikeToggle = (id: string) => {
    setInteractions(p => {
      const isAlreadyLiked = p.likedIds.includes(id);
      if (isAlreadyLiked) {
        return { ...p, likedIds: p.likedIds.filter(x => x !== id) };
      }
      return { ...p, likedIds: [...p.likedIds, id], dislikedIds: p.dislikedIds.filter(x => x !== id) };
    });
  };

  const handleDislike = (id: string) => {
    setInteractions(p => ({
      ...p,
      dislikedIds: Array.from(new Set([...p.dislikedIds, id])),
      likedIds: p.likedIds.filter(x => x !== id)
    }));
    showToast("تم الاستبعاد ⚰️");
    setSelectedShort(null);
    setSelectedLong(null);
  };

  const handleDownloadToggle = async (video: Video) => {
    const videoId = video.id;
    const isDownloaded = interactions.downloadedIds.includes(videoId);
    
    if (isDownloaded) {
      if (window.confirm("حذف من الخزنة؟")) {
        await removeVideoFromCache(video.video_url);
        setInteractions(p => ({
          ...p,
          downloadedIds: p.downloadedIds.filter(id => id !== videoId)
        }));
        showToast("تمت الإزالة");
      }
    } else {
      setDownloadProgress({ id: videoId, progress: 0 });
      const success = await downloadVideoWithProgress(video.video_url, (p) => {
        setDownloadProgress({ id: videoId, progress: p });
      });
      if (success) {
        setInteractions(p => ({
          ...p,
          downloadedIds: [...new Set([...p.downloadedIds, videoId])]
        }));
        showToast("تم الحفظ في الخزنة 🦁");
      }
      setDownloadProgress(null);
    }
  };

  const renderContent = () => {
    // التأكد من أن القوائم الممررة للصفحات مفلترة بدقة تامة
    // "Shorts" بالضبط، و "Long Video" بالضبط
    const activeVideos = displayVideos; 
    const shortsOnly = activeVideos.filter(v => v.video_type === 'Shorts');
    const longsOnly = activeVideos.filter(v => v.video_type === 'Long Video');

    switch(currentView) {
      case AppView.ADMIN:
        return (
          <Suspense fallback={null}>
            <AdminDashboard 
              onClose={() => setCurrentView(AppView.HOME)} 
              categories={OFFICIAL_CATEGORIES}
              initialVideos={activeVideos}
            />
          </Suspense>
        );
      case AppView.OFFLINE:
        return (
          <Suspense fallback={null}>
            <OfflinePage 
              allVideos={activeVideos} interactions={interactions} 
              onPlayShort={(v, l) => setSelectedShort({video:v, list:l})} 
              onPlayLong={(v) => setSelectedLong({video:v, list:longsOnly})} 
              onBack={() => setCurrentView(AppView.HOME)}
              onUpdateInteractions={setInteractions}
            />
          </Suspense>
        );
      case AppView.CATEGORY:
        return (
          <Suspense fallback={null}>
            <CategoryPage 
              category={activeCategory} allVideos={activeVideos}
              isSaved={interactions.savedCategoryNames.includes(activeCategory)}
              onToggleSave={() => {
                setInteractions(p => {
                  const isSaved = p.savedCategoryNames.includes(activeCategory);
                  return { ...p, savedCategoryNames: isSaved ? p.savedCategoryNames.filter(c => c !== activeCategory) : [...p.savedCategoryNames, activeCategory] };
                });
              }}
              onPlayShort={(v, l) => setSelectedShort({video:v, list:l})}
              onPlayLong={(v) => setSelectedLong({video:v, list:longsOnly})}
              onBack={() => setCurrentView(AppView.HOME)}
            />
          </Suspense>
        );
      case AppView.TREND:
        return (
          <Suspense fallback={null}>
            <TrendPage 
              allVideos={rawVideos}
              onPlayShort={(v, l) => setSelectedShort({video:v, list:shortsOnly})} 
              onPlayLong={(v) => setSelectedLong({video:v, list:longsOnly})} 
              excludedIds={interactions.dislikedIds} 
            />
          </Suspense>
        );
      case AppView.LIKES:
        return (
          <Suspense fallback={null}>
            <SavedPage 
              title="الإعجابات"
              savedIds={interactions.likedIds}
              savedCategories={[]} 
              allVideos={activeVideos}
              onPlayShort={(v, l) => setSelectedShort({video:v, list:l})}
              onPlayLong={(v) => setSelectedLong({video:v, list:longsOnly})}
              onCategoryClick={(cat) => { setActiveCategory(cat); setCurrentView(AppView.CATEGORY); }}
            />
          </Suspense>
        );
      case AppView.SAVED:
        return (
          <Suspense fallback={null}>
            <SavedPage 
              title="المحفوظات"
              savedIds={interactions.savedIds}
              savedCategories={interactions.savedCategoryNames}
              allVideos={activeVideos}
              onPlayShort={(v, l) => setSelectedShort({video:v, list:l})}
              onPlayLong={(v) => setSelectedLong({video:v, list:longsOnly})}
              onCategoryClick={(cat) => { setActiveCategory(cat); setCurrentView(AppView.CATEGORY); }}
            />
          </Suspense>
        );
      case AppView.HIDDEN:
        return (
          <Suspense fallback={null}>
            <HiddenVideosPage 
              interactions={interactions}
              allVideos={activeVideos}
              onRestore={(id) => {
                setInteractions(p => ({
                  ...p,
                  dislikedIds: p.dislikedIds.filter(x => x !== id)
                }));
                showToast("تم استعادة الروح المعذبة 🩸");
              }}
              onPlayShort={(v, l) => setSelectedShort({video:v, list:l})}
              onPlayLong={(v) => setSelectedLong({video:v, list:longsOnly})}
            />
          </Suspense>
        );
      case AppView.PRIVACY:
        return (
          <Suspense fallback={null}>
            <PrivacyPage onOpenAdmin={() => setCurrentView(AppView.ADMIN)} />
          </Suspense>
        );
      case AppView.UNWATCHED:
        return (
           <Suspense fallback={null}>
             <UnwatchedPage 
               watchHistory={interactions.watchHistory}
               allVideos={activeVideos}
               onPlayShort={(v, l) => setSelectedShort({video:v, list:l})} 
               onPlayLong={(v) => setSelectedLong({video:v, list:longsOnly})} 
             />
           </Suspense>
        );
      case AppView.HOME:
      default:
        return (
          <MainContent 
            key={refreshKey} 
            videos={activeVideos.filter(v => !interactions.dislikedIds.includes(v.id))} 
            categoriesList={OFFICIAL_CATEGORIES}
            interactions={interactions}
            // نمرر هنا فقط الشورتس عند تشغيل الشورتس، وفقط الطويلة عند تشغيل الطويلة
            onPlayShort={(v: Video, l: Video[]) => setSelectedShort({video:v, list:shortsOnly})}
            onPlayLong={(v: Video) => setSelectedLong({video:v, list:longsOnly})}
            onCategoryClick={(cat: string) => { setActiveCategory(cat); setCurrentView(AppView.CATEGORY); }}
            onHardRefresh={handleManualRefresh}
            onOfflineClick={() => setCurrentView(AppView.OFFLINE)}
            loading={loading}
            isOverlayActive={isOverlayActive}
            downloadProgress={downloadProgress}
            syncStatus={null}
            onLike={handleLikeToggle}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <AppBar 
        currentView={currentView} 
        onViewChange={setCurrentView} 
        onRefresh={handleManualRefresh}
      />
      
      <main className="pt-20 pb-24 max-w-md mx-auto px-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[70vh]">
            <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-red-600 font-black animate-pulse text-sm">جاري جلب أهوال جديدة... 💀</p>
          </div>
        ) : renderContent()}
      </main>

      <AIOracle />

      {selectedShort && (
        <Suspense fallback={null}>
          <ShortsPlayerOverlay 
            initialVideo={selectedShort.video}
            videoList={selectedShort.list}
            interactions={interactions}
            onClose={() => setSelectedShort(null)}
            onLike={handleLikeToggle}
            onDislike={handleDislike}
            onCategoryClick={(cat) => {
              setActiveCategory(cat);
              setCurrentView(AppView.CATEGORY);
              setSelectedShort(null);
            }}
            onSave={(id) => {
              setInteractions(p => {
                const isSaved = p.savedIds.includes(id);
                return { ...p, savedIds: isSaved ? p.savedIds.filter(x => x !== id) : [...p.savedIds, id] };
              });
            }}
            onProgress={(id, progress) => {
              setInteractions(p => {
                const history = p.watchHistory.filter(h => h.id !== id);
                return { ...p, watchHistory: [...history, { id, progress }] };
              });
            }}
            onDownload={handleDownloadToggle}
            isGlobalDownloading={!!downloadProgress}
          />
        </Suspense>
      )}

      {selectedLong && (
        <Suspense fallback={null}>
          <LongPlayerOverlay 
            video={selectedLong.video}
            allLongVideos={selectedLong.list}
            onClose={() => setSelectedLong(null)}
            onLike={() => handleLikeToggle(selectedLong.video.id)}
            onDislike={() => handleDislike(selectedLong.video.id)}
            onSave={() => {
              const id = selectedLong.video.id;
              setInteractions(p => {
                const isSaved = p.savedIds.includes(id);
                return { ...p, savedIds: isSaved ? p.savedIds.filter(x => x !== id) : [...p.savedIds, id] };
              });
            }}
            onSwitchVideo={(v) => setSelectedLong({ video: v, list: selectedLong.list })}
            onCategoryClick={(cat) => {
              setActiveCategory(cat);
              setCurrentView(AppView.CATEGORY);
              setSelectedLong(null);
            }}
            onDownload={() => handleDownloadToggle(selectedLong.video)}
            isLiked={interactions.likedIds.includes(selectedLong.video.id)}
            isDisliked={interactions.dislikedIds.includes(selectedLong.video.id)}
            isSaved={interactions.savedIds.includes(selectedLong.video.id)}
            isDownloaded={interactions.downloadedIds.includes(selectedLong.video.id)}
            isGlobalDownloading={!!downloadProgress}
            onProgress={(p) => {
              const id = selectedLong.video.id;
              setInteractions(prev => {
                const history = prev.watchHistory.filter(h => h.id !== id);
                return { ...prev, watchHistory: [...history, { id, progress: p }] };
              });
            }}
          />
        </Suspense>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[1000] bg-red-600 text-white px-6 py-3 rounded-full font-black shadow-[0_0_20px_red] animate-bounce text-xs">
          {toast}
        </div>
      )}
    </div>
  );
};

export default App;
