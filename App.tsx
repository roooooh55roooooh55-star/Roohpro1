
import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import { Video, AppView, UserInteractions } from './types';
import { db } from './firebaseConfig';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import AppBar from './AppBar';
import MainContent from './MainContent';
import { downloadVideoWithProgress, removeVideoFromCache } from './offlineManager';
import { initSmartBuffering } from './smartCache';

const ShortsPlayerOverlay = lazy(() => import('./ShortsPlayerOverlay'));
const LongPlayerOverlay = lazy(() => import('./LongPlayerOverlay'));
const AdminDashboard = lazy(() => import('./AdminDashboard'));
const AIOracle = lazy(() => import('./AIOracle'));
const TrendPage = lazy(() => import('./TrendPage'));
const SavedPage = lazy(() => import('./SavedPage'));
const PrivacyPage = lazy(() => import('./PrivacyPage'));
const HiddenVideosPage = lazy(() => import('./HiddenVideosPage'));
const CategoryPage = lazy(() => import('./CategoryPage'));
const OfflinePage = lazy(() => import('./OfflinePage'));
const UnwatchedPage = lazy(() => import('./UnwatchedPage'));

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

  // 🧠 AI Logic: خوارزمية التوصية الذكية والفلترة
  const applySmartRecommendations = useCallback((videos: Video[], userInteractions: UserInteractions) => {
    // 1. استبعاد الفيديوهات التي تم الإعجاب بها مسبقاً (لن تظهر في الواجهة)
    const unseenVideos = videos.filter(v => !userInteractions.likedIds.includes(v.id));

    // 2. تحليل تفضيلات المستخدم بناءً على الإعجابات السابقة
    const likedVideos = videos.filter(v => userInteractions.likedIds.includes(v.id));
    const preferredCategories = new Set(likedVideos.map(v => v.category));

    // 3. نظام النقاط (Scoring System)
    const scoredVideos = unseenVideos.map(video => {
      let score = Math.random(); // عشوائية أساسية للتنويع

      // زيادة النقاط بشكل كبير إذا كان الفيديو من قسم يحبه المستخدم
      if (preferredCategories.has(video.category)) {
        score += 10; 
      }

      // زيادة طفيفة للترند
      if (video.is_trending) {
        score += 2;
      }

      return { video, score };
    });

    // 4. ترتيب الفيديوهات بناءً على النقاط (الأعلى يظهر أولاً)
    scoredVideos.sort((a, b) => b.score - a.score);

    return scoredVideos.map(item => item.video);
  }, []);

  const handleManualRefresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      // عند التحديث اليدوي، نعيد تطبيق الخوارزمية الذكية
      const newOrder = applySmartRecommendations(rawVideos, interactions);
      setDisplayVideos(newOrder);
      setRefreshKey(prev => prev + 1);
      setCurrentView(AppView.HOME);
      initSmartBuffering(newOrder);
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 800); 
  }, [rawVideos, interactions, applySmartRecommendations]);

  // تحديث القائمة المعروضة تلقائياً عند تغير الإعجابات (لإخفاء الفيديو المعجب به فوراً)
  useEffect(() => {
    if (rawVideos.length > 0) {
      const updatedList = applySmartRecommendations(rawVideos, interactions);
      setDisplayVideos(updatedList);
    }
  }, [interactions.likedIds, rawVideos, applySmartRecommendations]);

  useEffect(() => {
    // تسجيل وقت البدء لضمان ظهور اللوجو لمدة ثانية واحدة على الأقل
    const startLoadTime = Date.now();
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
      
      const validVideos = videosList.filter(v => (v.video_url && v.video_url.trim() !== "") || (v.redirect_url && v.redirect_url.trim() !== ""));
      
      setRawVideos(validVideos);
      
      // تطبيق التوصيات فور تحميل البيانات
      const smartList = applySmartRecommendations(validVideos, interactions);
      setDisplayVideos(smartList);
      
      if (validVideos.length > 0) {
        initSmartBuffering(validVideos);
      }
      
      const elapsedTime = Date.now() - startLoadTime;
      const remainingTime = Math.max(0, 1000 - elapsedTime);

      setTimeout(() => {
        setLoading(false);
      }, remainingTime);

    }, (err) => {
      console.error("Firebase Error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []); // Run once on mount

  useEffect(() => { 
    localStorage.setItem('al-hadiqa-interactions-v12', JSON.stringify(interactions)); 
  }, [interactions]);

  // FIX: Force close players ONLY if the video is deleted from DATABASE (rawVideos)
  // We do NOT check displayVideos here because displayVideos hides liked videos, 
  // and we don't want to close the player just because the user liked the video.
  useEffect(() => {
    if (selectedShort && !rawVideos.find(v => v.id === selectedShort.video.id)) {
      setSelectedShort(null);
    }
    if (selectedLong && !rawVideos.find(v => v.id === selectedLong.video.id)) {
      setSelectedLong(null);
    }
  }, [rawVideos, selectedShort, selectedLong]);

  const handleLikeToggle = (id: string) => {
    setInteractions(p => {
      const isAlreadyLiked = p.likedIds.includes(id);
      if (isAlreadyLiked) {
        // إذا قام بإزالة الإعجاب، سيعود الفيديو للظهور في القائمة الرئيسية بفضل useEffect
        return { ...p, likedIds: p.likedIds.filter(x => x !== id) };
      }
      // عند الإعجاب، ستتم إضافته للقائمة، وبالتالي سيختفي من العرض الرئيسي
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
              // Offline page needs ALL videos to find downloads, not just displayed ones
              allVideos={rawVideos} 
              interactions={interactions} 
              onPlayShort={(v, l) => setSelectedShort({video:v, list:l})} 
              onPlayLong={(v) => setSelectedLong({video:v, list:rawVideos.filter(rv => rv.video_type === 'Long Video')})} 
              onBack={() => setCurrentView(AppView.HOME)}
              onUpdateInteractions={setInteractions}
            />
          </Suspense>
        );
      case AppView.CATEGORY:
        return (
          <Suspense fallback={null}>
            <CategoryPage 
              category={activeCategory} 
              // Category page should show videos even if liked? 
              // Usually yes, so we pass rawVideos filtered by category logic inside component.
              // But strictly following "remove from page", we pass displayVideos to be consistent with home feed behavior,
              // OR pass rawVideos if we want category page to show everything including liked.
              // Let's pass displayVideos to maintain the "Hide Liked" logic globally.
              allVideos={displayVideos}
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
              allVideos={rawVideos} // Trend page shows everything regardless of like status usually
              onPlayShort={(v, l) => setSelectedShort({video:v, list:rawVideos.filter(rv => rv.video_type === 'Shorts')})} 
              onPlayLong={(v) => setSelectedLong({video:v, list:rawVideos.filter(rv => rv.video_type === 'Long Video')})} 
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
              allVideos={rawVideos} // Likes page MUST show liked videos (from raw)
              onPlayShort={(v, l) => setSelectedShort({video:v, list:l})}
              onPlayLong={(v) => setSelectedLong({video:v, list:rawVideos.filter(rv => rv.video_type === 'Long Video')})}
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
              allVideos={rawVideos}
              onPlayShort={(v, l) => setSelectedShort({video:v, list:l})}
              onPlayLong={(v) => setSelectedLong({video:v, list:rawVideos.filter(rv => rv.video_type === 'Long Video')})}
              onCategoryClick={(cat) => { setActiveCategory(cat); setCurrentView(AppView.CATEGORY); }}
            />
          </Suspense>
        );
      case AppView.HIDDEN:
        return (
          <Suspense fallback={null}>
            <HiddenVideosPage 
              interactions={interactions}
              allVideos={rawVideos}
              onRestore={(id) => {
                setInteractions(p => ({
                  ...p,
                  dislikedIds: p.dislikedIds.filter(x => x !== id)
                }));
                showToast("تم استعادة الروح المعذبة 🩸");
              }}
              onPlayShort={(v, l) => setSelectedShort({video:v, list:l})}
              onPlayLong={(v) => setSelectedLong({video:v, list:rawVideos.filter(rv => rv.video_type === 'Long Video')})}
            />
          </Suspense>
        );
      case AppView.PRIVACY:
        return (
          <Suspense fallback={null}>
            <PrivacyPage 
              onOpenAdmin={() => setCurrentView(AppView.ADMIN)} 
              onBack={() => {
                setCurrentView(AppView.HOME);
                handleManualRefresh();
              }}
            />
          </Suspense>
        );
      case AppView.UNWATCHED:
        return (
           <Suspense fallback={null}>
             <UnwatchedPage 
               watchHistory={interactions.watchHistory}
               allVideos={rawVideos}
               onPlayShort={(v, l) => setSelectedShort({video:v, list:l})} 
               onPlayLong={(v) => setSelectedLong({video:v, list:rawVideos.filter(rv => rv.video_type === 'Long Video')})} 
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
      
      {/* Reduced pt-20 to pt-16 to remove the large gap at the top */}
      <main className="pt-16 pb-24 max-w-md mx-auto px-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[70vh] relative">
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 flex items-center justify-center">
               <div className="w-40 h-40 bg-red-600/20 blur-[50px] rounded-full animate-pulse"></div>
            </div>

            <div className="relative flex items-center justify-center">
              {/* Outer Neon Ring - Red */}
              <div className="absolute w-28 h-28 rounded-full border-t-4 border-b-4 border-red-600 border-l-transparent border-r-transparent animate-spin shadow-[0_0_30px_rgba(220,38,38,0.6)]" style={{ animationDuration: '1.5s' }}></div>
              
              {/* Inner Neon Ring - Yellow (Reverse) */}
              <div className="absolute w-24 h-24 rounded-full border-l-2 border-r-2 border-yellow-500 border-t-transparent border-b-transparent animate-spin shadow-[0_0_20px_rgba(234,179,8,0.6)]" style={{ animationDirection: 'reverse', animationDuration: '2s' }}></div>

              {/* Central Logo */}
              <div className="relative z-10 w-20 h-20 rounded-full overflow-hidden border-2 border-white/10 shadow-[0_0_50px_rgba(220,38,38,0.8)] animate-pulse">
                <img 
                  src="https://i.top4top.io/p_3643ksmii1.jpg" 
                  className="w-full h-full object-cover opacity-90"
                  alt="Loading..."
                />
              </div>
            </div>
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
            onClose={() => {
              setSelectedShort(null);
              // Trigger refresh when shorts overlay is closed to update feed if likes changed
              handleManualRefresh();
            }}
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
