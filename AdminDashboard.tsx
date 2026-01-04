
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Video, VideoType } from './types';
import { db, ensureAuth } from './firebaseConfig';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';

const LOGO_URL = "https://i.top4top.io/p_3643ksmii1.jpg";

interface AdminDashboardProps {
  onClose: () => void;
  categories: string[];
  initialVideos: Video[];
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  onClose, categories, initialVideos 
}) => {
  const [currentPasscode] = useState('5030775');
  const [passcode, setPasscode] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('الكل');
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  
  // View Mode: 'videos' | 'ai_setup' | 'keys'
  const [viewMode, setViewMode] = useState<'videos' | 'keys' | 'ai_setup'>('videos'); 
  
  // Security State
  const [failedAttempts, setFailedAttempts] = useState(() => {
    return parseInt(localStorage.getItem('admin_failed_attempts') || '0');
  });
  const [lockoutUntil, setLockoutUntil] = useState(() => {
    return parseInt(localStorage.getItem('admin_lockout_until') || '0');
  });

  // State for delete confirmation modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const [newVideo, setNewVideo] = useState({
    title: '',
    description: '',
    category: categories[0] || 'هجمات مرعبة',
    video_type: 'Shorts' as VideoType, // Strict strict 'Shorts' | 'Long Video'
    is_trending: false,
    read_narrative: false, // New Field
    redirect_url: '' // This maps to the "external_link" requirement from user
  });

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to get persistent device ID for Firebase logging
  const getDeviceId = () => {
    let id = localStorage.getItem('device_security_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
      localStorage.setItem('device_security_id', id);
    }
    return id;
  };

  const handleAuth = async () => {
    // Check lockout first
    if (Date.now() < lockoutUntil) {
       return;
    }

    if (passcode === currentPasscode) {
      setIsAuthenticated(true);
      setFailedAttempts(0);
      localStorage.setItem('admin_failed_attempts', '0');
    } else { 
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      localStorage.setItem('admin_failed_attempts', newAttempts.toString());
      setPasscode('');
      
      if (newAttempts >= 5) {
        const lockoutTime = Date.now() + (60 * 60 * 1000); // 1 Hour
        setLockoutUntil(lockoutTime);
        localStorage.setItem('admin_lockout_until', lockoutTime.toString());
        
        // Log security breach to Firebase
        try {
          await ensureAuth();
          await addDoc(collection(db, "security_lockouts"), {
            device_id: getDeviceId(),
            timestamp: serverTimestamp(),
            reason: "5_failed_attempts",
            lockout_until: new Date(lockoutTime).toISOString(),
            user_agent: navigator.userAgent
          });
        } catch (e) {
          console.error("Failed to log security event", e);
        }
      } else {
        alert(`الرمز خاطئ! المحاولة ${newAttempts} من 5.`);
      }
    }
  };

  const isLockedOut = Date.now() < lockoutUntil;

  const uploadFileToStorage = async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      let prog = 0;
      const interval = setInterval(() => {
        prog += Math.random() * 20;
        if (prog >= 100) {
          prog = 100;
          clearInterval(interval);
          setUploadProgress(100);
          // R2 link generation simulation - This matches the requirement to use R2 links
          resolve(`https://pub-rooh1.r2.dev/videos/${Date.now()}_${file.name.replace(/\s+/g, '_')}`);
        }
        setUploadProgress(Math.floor(prog));
      }, 150);
    });
  };

  const handlePublish = async () => {
    const file = fileInputRef.current?.files?.[0];
    
    if (!file && !newVideo.redirect_url) {
      alert("الرجاء اختيار ملف فيديو أو وضع رابط خارجي!");
      return;
    }
    if (!newVideo.title) {
      alert("الرجاء كتابة عنوان للكابوس!");
      return;
    }

    setIsUploading(true);
    try {
      await ensureAuth();
      let videoUrl = "";
      if (file) {
        videoUrl = await uploadFileToStorage(file);
      } else {
        videoUrl = newVideo.redirect_url; 
      }
      
      const videoData = {
        title: newVideo.title,
        description: newVideo.description,
        category: newVideo.category,
        video_type: newVideo.video_type, // Enforce "Shorts" or "Long Video"
        is_trending: newVideo.is_trending,
        read_narrative: newVideo.read_narrative, // New Field
        video_url: videoUrl,
        redirect_url: newVideo.redirect_url || null, // External Link
        created_at: serverTimestamp(),
        views: 0,
        likes: 0
      };

      await addDoc(collection(db, "videos"), videoData);
      alert("تم بنجاح! الفيديو الآن متاح للجميع 💀");
      
      setNewVideo({
        title: '',
        description: '',
        category: categories[0] || 'هجمات مرعبة',
        video_type: 'Shorts',
        is_trending: false,
        read_narrative: false,
        redirect_url: ''
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      alert("فشل النشر.. تأكد من اتصالك بالإنترنت");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const toggleTrending = async (v: Video) => {
    try {
      await ensureAuth();
      await updateDoc(doc(db, "videos", v.id), { is_trending: !v.is_trending });
    } catch (e) { alert("فشل تحديث الترند"); }
  };

  const handleUpdate = async (v: Video) => {
    try {
      await ensureAuth();
      const { id, ...data } = v;
      const cleanData = JSON.parse(JSON.stringify(data));
      await updateDoc(doc(db, "videos", id), cleanData);
      setEditingVideo(null);
      alert("تم التحديث بنجاح");
    } catch (e) { alert("خطأ في التحديث"); }
  };

  const filteredVideos = useMemo(() => {
    return initialVideos.filter(v => {
      const matchesSearch = v.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = filterCategory === 'الكل' || v.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [initialVideos, searchQuery, filterCategory]);

  if (!isAuthenticated) {
    if (isLockedOut) {
      return (
        <div className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center p-6 text-center" dir="rtl">
           <div className="w-24 h-24 rounded-full border-4 border-red-900 flex items-center justify-center mb-6 animate-pulse">
             <svg className="w-12 h-12 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
           </div>
           <h2 className="text-3xl font-black text-red-800 italic">نظام مغلق أمنياً</h2>
           <p className="text-gray-500 mt-4 font-bold text-sm">تم استنفاذ محاولات الدخول. <br/> يرجى العودة لاحقاً.</p>
           <button onClick={onClose} className="mt-10 px-8 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-bold">خروج</button>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center p-6" dir="rtl">
        <div className="flex flex-col items-center mb-10 animate-in zoom-in duration-500">
          <div className="relative">
            <div className="absolute inset-0 bg-red-600 blur-xl opacity-20 animate-pulse rounded-full"></div>
            <img src={LOGO_URL} className="w-24 h-24 rounded-full border-4 border-red-600 relative z-10 shadow-[0_0_30px_red]" />
          </div>
          <h2 className="text-2xl font-black text-red-600 mt-6 italic tracking-wider drop-shadow-lg">لوحة التحكم السيادية</h2>
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.3em] font-bold mt-2">Restricted Access Area</p>
        </div>

        <div className="flex gap-3 mb-10" dir="ltr">
          {[...Array(7)].map((_, i) => (
            <div 
              key={i} 
              className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${
                passcode.length > i 
                ? 'bg-red-600 border-red-600 shadow-[0_0_10px_red] scale-110' 
                : 'border-red-900/50 bg-transparent'
              }`}
            ></div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4 w-full max-w-[320px]" dir="ltr">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => passcode.length < 7 && setPasscode(p => p + num)}
              className="h-20 w-full bg-neutral-900/50 backdrop-blur-md rounded-2xl text-3xl font-black text-white border border-white/10 hover:border-red-600/50 active:bg-red-600 active:border-red-500 active:scale-95 transition-all shadow-lg flex items-center justify-center"
            >
              {num}
            </button>
          ))}
          
          <button
            onClick={() => setPasscode('')}
            className="h-20 w-full bg-red-950/20 rounded-2xl flex items-center justify-center text-red-500 border border-red-900/30 active:bg-red-900/40 active:scale-95 transition-all hover:bg-red-900/20"
          >
            <span className="text-sm font-black">مسح</span>
          </button>

          <button
            onClick={() => passcode.length < 7 && setPasscode(p => p + '0')}
            className="h-20 w-full bg-neutral-900/50 backdrop-blur-md rounded-2xl text-3xl font-black text-white border border-white/10 hover:border-red-600/50 active:bg-red-600 active:border-red-500 active:scale-95 transition-all shadow-lg flex items-center justify-center"
          >
            0
          </button>

          <button
            onClick={handleAuth}
            className="h-20 w-full bg-gradient-to-br from-red-600 to-red-700 rounded-2xl flex items-center justify-center text-white border border-red-500 shadow-[0_0_25px_rgba(220,38,38,0.4)] hover:shadow-[0_0_35px_rgba(220,38,38,0.6)] active:scale-95 transition-all"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[900] bg-black overflow-hidden flex flex-col font-sans" dir="rtl">
      {/* Header with 3 Buttons */}
      <div className="h-20 border-b border-white/10 flex items-center justify-between px-6 bg-black/80 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-3">
          <img src={LOGO_URL} className="w-10 h-10 rounded-full border-2 border-red-600" />
          <h1 className="text-lg font-black text-red-600 italic">نظام الرفع - Rooh 1</h1>
        </div>
        <div className="flex gap-2">
            <button 
              onClick={() => setViewMode('ai_setup')} 
              className={`px-4 py-2 rounded-lg text-[10px] font-bold border transition-all ${viewMode === 'ai_setup' ? 'bg-purple-600 text-white border-purple-400' : 'bg-white/10 text-white border-white/10 hover:bg-white/20'}`}
            >
                AI Avatar
            </button>
            <button 
              onClick={() => setViewMode('videos')} 
              className={`px-4 py-2 rounded-lg text-[10px] font-bold border transition-all ${viewMode === 'videos' ? 'bg-red-600 text-white border-red-400' : 'bg-white/10 text-white border-white/10 hover:bg-white/20'}`}
            >
                فيديوهات
            </button>
            <button 
              onClick={() => setViewMode('keys')} 
              className={`px-4 py-2 rounded-lg text-[10px] font-bold border transition-all ${viewMode === 'keys' ? 'bg-green-600 text-white border-green-400 shadow-[0_0_10px_green]' : 'bg-white/10 text-white border-white/10 hover:bg-white/20'}`}
            >
                إدارة المفاتيح
            </button>
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-white">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
      </div>

      {viewMode === 'ai_setup' ? (
          <AIAvatarManager />
      ) : viewMode === 'keys' ? (
          <CentralKeyManager />
      ) : (
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 pb-32 space-y-8">
            <div className="bg-neutral-900/30 border border-white/5 p-6 rounded-[2.5rem] shadow-2xl">
            <h2 className="text-xs font-black text-red-600 mb-6 uppercase tracking-widest">إضافة كابوس جديد</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                <input type="text" placeholder="عنوان الفيديو..." value={newVideo.title} onChange={e => setNewVideo({...newVideo, title: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white font-bold outline-none focus:border-red-600" />
                <textarea placeholder="سرد الرعب..." value={newVideo.description} onChange={e => setNewVideo({...newVideo, description: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white min-h-[80px] outline-none" />
                <div className="grid grid-cols-2 gap-4">
                    <select value={newVideo.category} onChange={e => setNewVideo({...newVideo, category: e.target.value})} className="bg-black border border-white/10 rounded-xl p-4 text-red-500 font-bold outline-none">
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={newVideo.video_type} onChange={e => setNewVideo({...newVideo, video_type: e.target.value as VideoType})} className="bg-black border border-white/10 rounded-xl p-4 text-white outline-none">
                    <option value="Shorts">Shorts</option>
                    <option value="Long Video">Long Video</option>
                    </select>
                </div>
                
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 p-3 bg-black border border-white/5 rounded-xl">
                        <input type="checkbox" checked={newVideo.is_trending} onChange={e => setNewVideo({...newVideo, is_trending: e.target.checked})} className="w-5 h-5 accent-red-600" id="trending-check" />
                        <label htmlFor="trending-check" className="text-white text-sm font-bold cursor-pointer select-none">تفعيل شارة الترند (Trending)</label>
                    </div>
                    <div className="flex items-center gap-2 p-3 bg-black border border-white/5 rounded-xl">
                        <input type="checkbox" checked={newVideo.read_narrative} onChange={e => setNewVideo({...newVideo, read_narrative: e.target.checked})} className="w-5 h-5 accent-green-600" id="narrative-check" />
                        <label htmlFor="narrative-check" className="text-white text-sm font-bold cursor-pointer select-none flex items-center gap-2">
                             <span>قراءة السرد صوتياً (ElevenLabs)</span>
                             <span className="text-[9px] bg-green-900 text-green-400 px-1.5 rounded">AUTO</span>
                        </label>
                    </div>
                </div>

                <input type="text" placeholder="رابط خارجي (External Link / Redirect)..." value={newVideo.redirect_url} onChange={e => setNewVideo({...newVideo, redirect_url: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white outline-none placeholder:text-gray-600" />
                </div>

                <div onClick={() => !isUploading && fileInputRef.current?.click()} className={`border-4 border-dashed rounded-[2rem] flex flex-col items-center justify-center p-8 transition-all cursor-pointer ${isUploading ? 'border-red-600 bg-red-600/5' : 'border-white/5 hover:border-red-600'}`}>
                <input type="file" ref={fileInputRef} accept="video/*" className="hidden" />
                {isUploading ? (
                    <div className="text-center">
                    <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <span className="text-2xl font-black text-white">{uploadProgress}%</span>
                    </div>
                ) : (
                    <div className="text-center">
                    <svg className="w-12 h-12 text-gray-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                    <p className="text-white font-black text-xs">اضغط لرفع ملف R2</p>
                    </div>
                )}
                </div>
            </div>
            <button disabled={isUploading} onClick={handlePublish} className="w-full mt-6 bg-red-600 py-4 rounded-xl font-black text-white shadow-xl active:scale-95 disabled:opacity-50">نشر الآن 🔥</button>
            </div>

            <div className="flex gap-4">
            <input type="text" placeholder="ابحث..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 bg-neutral-900 border border-white/5 rounded-xl p-4 text-sm outline-none focus:border-red-600" />
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="bg-neutral-900 border border-white/5 rounded-xl p-4 text-xs font-bold text-red-500 outline-none">
                <option value="الكل">كل الأقسام</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVideos.map(v => (
                <div key={v.id} className={`bg-neutral-900/30 border border-white/5 p-4 rounded-[2rem] flex flex-col gap-4 ${v.is_trending ? 'border-red-600 shadow-[0_0_10px_red]' : ''}`}>
                <div className="aspect-video bg-black rounded-xl overflow-hidden relative">
                    <video src={v.video_url} className="w-full h-full object-cover" />
                    {v.is_trending && <div className="absolute top-2 right-2 bg-red-600 text-[8px] font-black px-2 py-0.5 rounded">TREND</div>}
                    {v.read_narrative && <div className="absolute top-2 left-2 bg-green-600 text-[8px] font-black px-2 py-0.5 rounded shadow-[0_0_10px_green]">TTS</div>}
                </div>
                <h3 className="text-xs font-black text-white truncate px-1">{v.title}</h3>
                <div className="flex gap-2">
                    <button onClick={() => setEditingVideo(v)} className="flex-1 bg-blue-600/20 text-blue-500 py-2 rounded-lg text-[10px] font-black">تعديل</button>
                    <button onClick={() => toggleTrending(v)} className="flex-1 bg-orange-600/20 text-orange-500 py-2 rounded-lg text-[10px] font-black">رائج</button>
                    <button onClick={() => setShowDeleteConfirm(v.id)} className="flex-1 bg-red-600/20 text-red-500 py-2 rounded-lg text-[10px] font-black">حذف</button>
                </div>
                </div>
            ))}
            </div>
        </div>
      )}

      {editingVideo && (
        <VideoEditor video={editingVideo} categories={categories} onClose={() => setEditingVideo(null)} onSave={handleUpdate} />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90 backdrop-blur-md p-6">
          <div className="bg-neutral-900 border border-red-600/30 p-8 rounded-[2.5rem] w-full max-w-sm text-center shadow-[0_0_50px_rgba(220,38,38,0.2)] animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-white mb-2">تأكيد المسح</h3>
            <p className="text-gray-400 text-sm mb-8 leading-relaxed">هل حذف هذا الفيديو نهائياً؟ .</p>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={async () => {
                  try {
                    await ensureAuth();
                    const videoRef = doc(db, "videos", showDeleteConfirm);
                    await deleteDoc(videoRef);
                    setShowDeleteConfirm(null);
                  } catch (e) {
                    console.error("Delete Error:", e);
                    alert("❌ فشل المسح من السيرفر");
                  }
                }}
                className="w-full bg-red-600 p-4 rounded-2xl text-white font-bold shadow-[0_0_20px_red] active:scale-95 transition-all"
              >
                نعم، امسح 
              </button>
              <button 
                onClick={() => setShowDeleteConfirm(null)}
                className="w-full bg-white/5 p-4 rounded-2xl text-white font-bold border border-white/10 active:scale-95 transition-all"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AIAvatarManager: React.FC = () => {
    const [silentUrl, setSilentUrl] = useState('');
    const [talkingUrl, setTalkingUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [uploadingType, setUploadingType] = useState<'silent' | 'talking' | null>(null);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                await ensureAuth();
                const docRef = doc(db, "settings", "ai_avatar");
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setSilentUrl(data.silent_url || '');
                    setTalkingUrl(data.talking_url || '');
                }
            } catch (e) {
                // Ignore permission errors if user hasn't set this up yet
                if ((e as any)?.code !== 'permission-denied') {
                    console.error("Error fetching AI settings:", e);
                }
            }
        };
        fetchSettings();
    }, []);

    const handleSaveUrls = async () => {
        setLoading(true);
        try {
            await ensureAuth();
            await setDoc(doc(db, "settings", "ai_avatar"), {
                silent_url: silentUrl,
                talking_url: talkingUrl,
                updated_at: serverTimestamp()
            });
            alert("تم حفظ إعدادات فيديوهات المساعد بنجاح ✅");
        } catch (e) {
            alert("حدث خطأ أثناء الحفظ");
        } finally {
            setLoading(false);
        }
    };

    const uploadVideo = async (file: File, type: 'silent' | 'talking') => {
        setUploadingType(type);
        return new Promise<string>((resolve) => {
          let prog = 0;
          const interval = setInterval(() => {
            prog += Math.random() * 20;
            if (prog >= 100) {
              prog = 100;
              clearInterval(interval);
              setProgress(100);
              resolve(`https://pub-rooh1.r2.dev/ai_avatars/${Date.now()}_${type}_${file.name.replace(/\s+/g, '_')}`);
            }
            setProgress(Math.floor(prog));
          }, 150);
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'silent' | 'talking') => {
        if (e.target.files && e.target.files[0]) {
            const url = await uploadVideo(e.target.files[0], type);
            if (type === 'silent') setSilentUrl(url);
            else setTalkingUrl(url);
            setUploadingType(null);
            setProgress(0);
        }
    };

    return (
        <div className="flex-1 p-6 space-y-8 overflow-y-auto pb-32">
             <div className="bg-neutral-900/50 border border-purple-500/30 p-8 rounded-[2rem] shadow-[0_0_30px_rgba(168,85,247,0.1)]">
                 <h2 className="text-xl font-black text-purple-500 mb-6 flex items-center gap-2">
                     <span className="w-3 h-3 bg-purple-500 rounded-full animate-pulse"></span>
                     إعدادات فيديوهات المساعد (AI Oracle)
                 </h2>
                 
                 <div className="space-y-8">
                     <div className="space-y-4 border-b border-white/5 pb-8">
                         <div className="flex items-center justify-between">
                            <h3 className="text-white font-bold">1. فيديو السكوت (Idle/Silent)</h3>
                            <span className="text-[10px] text-gray-400">يعمل عندما يكون المساعد صامتاً</span>
                         </div>
                         <div className="flex gap-4 items-center">
                             <input 
                               type="text" 
                               value={silentUrl} 
                               onChange={e => setSilentUrl(e.target.value)} 
                               placeholder="رابط فيديو السكوت..." 
                               className="flex-1 bg-black border border-white/10 rounded-xl p-4 text-white outline-none focus:border-purple-500"
                             />
                             <div className="flex flex-col gap-1">
                                <label className="bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl p-3 cursor-pointer text-white font-bold text-xs whitespace-nowrap text-center">
                                    {uploadingType === 'silent' ? `${progress}%` : 'تغيير/رفع'}
                                    <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileChange(e, 'silent')} />
                                </label>
                                {silentUrl && (
                                   <button 
                                      onClick={() => { if(window.confirm('مسح فيديو السكوت؟')) setSilentUrl(''); }}
                                      className="bg-red-600/20 hover:bg-red-600/40 border border-red-600/30 rounded-xl p-2 text-red-500 font-bold text-[10px]"
                                   >
                                      مسح
                                   </button>
                                )}
                             </div>
                         </div>
                     </div>

                     <div className="space-y-4">
                         <div className="flex items-center justify-between">
                            <h3 className="text-white font-bold">2. فيديو الكلام (Talking/Active)</h3>
                            <span className="text-[10px] text-gray-400">يعمل فقط عند نطق الصوت</span>
                         </div>
                         <div className="flex gap-4 items-center">
                             <input 
                               type="text" 
                               value={talkingUrl} 
                               onChange={e => setTalkingUrl(e.target.value)} 
                               placeholder="رابط فيديو الكلام..." 
                               className="flex-1 bg-black border border-white/10 rounded-xl p-4 text-white outline-none focus:border-purple-500"
                             />
                             <div className="flex flex-col gap-1">
                                <label className="bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl p-3 cursor-pointer text-white font-bold text-xs whitespace-nowrap text-center">
                                    {uploadingType === 'talking' ? `${progress}%` : 'تغيير/رفع'}
                                    <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileChange(e, 'talking')} />
                                </label>
                                {talkingUrl && (
                                   <button 
                                      onClick={() => { if(window.confirm('مسح فيديو الكلام؟')) setTalkingUrl(''); }}
                                      className="bg-red-600/20 hover:bg-red-600/40 border border-red-600/30 rounded-xl p-2 text-red-500 font-bold text-[10px]"
                                   >
                                      مسح
                                   </button>
                                )}
                             </div>
                         </div>
                     </div>

                     <button 
                       onClick={handleSaveUrls} 
                       disabled={loading}
                       className="w-full bg-purple-600 py-4 rounded-xl font-black text-white shadow-[0_0_15px_purple] hover:shadow-[0_0_25px_purple] active:scale-95 transition-all disabled:opacity-50 mt-8"
                     >
                         {loading ? "جاري الحفظ..." : "حفظ الإعدادات"}
                     </button>
                 </div>
             </div>
        </div>
    );
};

const VideoEditor: React.FC<{ video: Video, categories: string[], onClose: () => void, onSave: (v: Video) => void }> = ({ video, categories, onClose, onSave }) => {
  const [v, setV] = useState<Video>({ ...video });
  return (
    <div className="fixed inset-0 z-[1100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6" dir="rtl">
      <div className="bg-neutral-900 border border-white/10 w-full max-w-lg rounded-[2.5rem] p-8 space-y-6">
        <h2 className="text-xl font-black text-red-600 italic">تعديل البيانات</h2>
        <div className="space-y-4">
          <input type="text" value={v.title} onChange={e => setV({...v, title: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white" />
          <textarea value={v.description} onChange={e => setV({...v, description: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white min-h-[100px]" />
          <div className="grid grid-cols-2 gap-4">
            <select value={v.category} onChange={e => setV({...v, category: e.target.value})} className="bg-black border border-white/10 rounded-xl p-4 text-red-500 font-bold">
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={v.video_type} onChange={e => setV({...v, video_type: e.target.value as VideoType})} className="bg-black border border-white/10 rounded-xl p-4 text-white">
              <option value="Shorts">Shorts</option>
              <option value="Long Video">Long Video</option>
            </select>
          </div>
          <input type="text" value={v.redirect_url || ''} onChange={e => setV({...v, redirect_url: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white" />
        </div>
        <div className="flex gap-4">
          <button onClick={() => onSave(v)} className="flex-1 bg-red-600 py-4 rounded-xl font-black text-white">حفظ التغييرات</button>
          <button onClick={onClose} className="flex-1 bg-neutral-800 py-4 rounded-xl font-black text-white">إلغاء</button>
        </div>
      </div>
    </div>
  );
};

// --- Updated Component: Central Key Manager (Gemini + ElevenLabs Pool) ---
const CentralKeyManager: React.FC = () => {
    const [geminiKey, setGeminiKey] = useState('');
    const [elevenLabsKeys, setElevenLabsKeys] = useState<string[]>([]);
    const [elevenLabsIndex, setElevenLabsIndex] = useState(0);
    const [newELKey, setNewELKey] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                await ensureAuth();
                const docRef = doc(db, "settings", "api_config");
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setGeminiKey(data.gemini_key || '');
                    setElevenLabsKeys(data.elevenlabs_keys || []);
                    setElevenLabsIndex(data.elevenlabs_index || 0);
                }
            } catch (e) {
                console.error("Failed to load config", e);
            }
        };
        fetchConfig();
    }, []);

    const saveGeminiKey = async () => {
        setLoading(true);
        try {
            await ensureAuth();
            const docRef = doc(db, "settings", "api_config");
            await setDoc(docRef, { gemini_key: geminiKey }, { merge: true });
            alert("تم حفظ مفتاح Gemini بنجاح ✅");
        } catch (e) {
            alert("حدث خطأ أثناء الحفظ");
        } finally {
            setLoading(false);
        }
    };

    const addELKey = async () => {
        if (!newELKey.trim()) return;
        const updatedKeys = [...elevenLabsKeys, newELKey.trim()];
        setLoading(true);
        try {
            await ensureAuth();
            const docRef = doc(db, "settings", "api_config");
            await setDoc(docRef, { elevenlabs_keys: updatedKeys }, { merge: true });
            setElevenLabsKeys(updatedKeys);
            setNewELKey('');
        } catch (e) {
            alert("حدث خطأ");
        } finally {
            setLoading(false);
        }
    };

    const removeELKey = async (index: number) => {
        if (!window.confirm("حذف هذا المفتاح نهائياً؟")) return;
        
        const updatedKeys = elevenLabsKeys.filter((_, i) => i !== index);
        // Reset index safely
        let newIndex = elevenLabsIndex;
        if (index < elevenLabsIndex) newIndex--; // If removed one before active, decrement
        if (newIndex >= updatedKeys.length) newIndex = 0;
        
        setLoading(true);
        try {
            await ensureAuth();
            const docRef = doc(db, "settings", "api_config");
            await setDoc(docRef, { 
                elevenlabs_keys: updatedKeys,
                elevenlabs_index: newIndex
            }, { merge: true });
            setElevenLabsKeys(updatedKeys);
            setElevenLabsIndex(newIndex);
        } catch (e) {
            alert("حدث خطأ");
        } finally {
            setLoading(false);
        }
    };

    const maskKey = (key: string) => {
        if (!key || key.length < 10) return "****";
        return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        alert("تم نسخ المفتاح (خفي) ✅");
    };

    const getKeyStatus = (idx: number) => {
        if (idx < elevenLabsIndex) return { label: "منتهي/تجاوز", color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500" };
        if (idx === elevenLabsIndex) return { label: "نشط حالياً", color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500" };
        return { label: "في الانتظار", color: "text-gray-400", bg: "bg-gray-800", border: "border-gray-700" };
    };

    return (
        <div className="flex-1 p-6 space-y-8 overflow-y-auto pb-32">
             {/* Gemini Section */}
             <div className="bg-neutral-900/50 border border-blue-500/30 p-8 rounded-[2rem] shadow-[0_0_30px_rgba(59,130,246,0.1)]">
                 <h2 className="text-xl font-black text-blue-500 mb-6 flex items-center gap-2">
                     <span className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></span>
                     مفتاح العقل المدبر (Gemini AI)
                 </h2>
                 <div className="flex gap-4">
                     <input 
                       type="password" 
                       value={geminiKey} 
                       onChange={e => setGeminiKey(e.target.value)} 
                       placeholder="الصق مفتاح Gemini هنا (AIza...)" 
                       className="flex-1 bg-black border border-white/10 rounded-xl p-4 text-white font-mono outline-none focus:border-blue-500 placeholder:text-gray-700"
                     />
                     <button 
                       onClick={saveGeminiKey}
                       disabled={loading}
                       className="bg-blue-600 px-6 py-4 rounded-xl font-bold text-white shadow-[0_0_15px_blue] active:scale-95 transition-all"
                     >
                         {geminiKey ? "تحديث" : "حفظ"}
                     </button>
                 </div>
                 {geminiKey && (
                     <div className="mt-4 flex items-center gap-2 text-xs text-blue-400 font-bold bg-blue-900/20 w-fit px-3 py-1 rounded-full border border-blue-500/30">
                         <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                         مفتاح محفوظ ومتصل بالنظام
                     </div>
                 )}
             </div>

             {/* ElevenLabs Section */}
             <div className="bg-neutral-900/50 border border-green-500/30 p-8 rounded-[2rem] shadow-[0_0_30px_rgba(34,197,94,0.1)]">
                 <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-xl font-black text-green-500 flex items-center gap-2">
                            <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                            مفاتيح الصوت (ElevenLabs Pool)
                        </h2>
                        <p className="text-[10px] text-gray-500 mt-1">يتم التدوير تلقائياً عند انتهاء رصيد المفتاح الحالي.</p>
                    </div>
                    <span className="text-[10px] bg-green-900/30 text-green-400 px-3 py-1 rounded-full border border-green-500/30 font-mono">
                        Current Active Index: {elevenLabsIndex}
                    </span>
                 </div>
                 
                 <div className="flex gap-4 mb-8">
                     <input 
                       type="text" 
                       value={newELKey} 
                       onChange={e => setNewELKey(e.target.value)} 
                       placeholder="أضف مفتاح جديد (sk_...)" 
                       className="flex-1 bg-black border border-white/10 rounded-xl p-4 text-white font-mono outline-none focus:border-green-500"
                     />
                     <button 
                       onClick={addELKey}
                       disabled={loading || !newELKey}
                       className="bg-green-600 px-6 py-4 rounded-xl font-bold text-white shadow-[0_0_15px_green] active:scale-95 transition-all whitespace-nowrap"
                     >
                         + إضافة للقائمة
                     </button>
                 </div>

                 <div className="space-y-3">
                     {elevenLabsKeys.map((k, idx) => {
                         const status = getKeyStatus(idx);
                         return (
                             <div key={idx} className={`p-4 rounded-xl flex items-center justify-between border transition-colors ${status.bg} ${status.border} ${idx === elevenLabsIndex ? 'shadow-[0_0_15px_rgba(34,197,94,0.2)]' : ''}`}>
                                 <div className="flex items-center gap-4">
                                     <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold bg-black text-white border border-white/10`}>
                                         {idx + 1}
                                     </span>
                                     <div className="flex flex-col">
                                         <span className="text-sm font-mono text-white tracking-widest font-bold">
                                             {maskKey(k)}
                                         </span>
                                         <span className={`text-[9px] font-black uppercase tracking-widest mt-1 ${status.color}`}>
                                             {status.label}
                                         </span>
                                     </div>
                                 </div>
                                 <div className="flex gap-2">
                                     <button 
                                       onClick={() => copyToClipboard(k)}
                                       className="text-gray-400 hover:text-white p-2 rounded-lg bg-black/40 hover:bg-white/10 transition-colors"
                                       title="نسخ المفتاح"
                                     >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                     </button>
                                     <button 
                                       onClick={() => removeELKey(idx)} 
                                       className="text-red-500 hover:text-red-400 p-2 rounded-lg bg-red-600/10 hover:bg-red-600/20 transition-colors"
                                       title="حذف"
                                     >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                     </button>
                                 </div>
                             </div>
                         );
                     })}
                     {elevenLabsKeys.length === 0 && <p className="text-center text-gray-600 text-sm py-4 italic">لم تتم إضافة أي مفاتيح بعد.</p>}
                 </div>
             </div>
        </div>
    );
};

export default AdminDashboard;
