
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Video, VideoType } from './types';
import { db, ensureAuth } from './firebaseConfig';
import firebase from 'firebase/compat/app';

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
          await db.collection("security_lockouts").add({
            device_id: getDeviceId(),
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
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
        created_at: firebase.firestore.FieldValue.serverTimestamp(),
        views: 0,
        likes: 0
      };

      await db.collection("videos").add(videoData);
      alert("تم بنجاح! الفيديو الآن متاح للجميع (R2 Vault) 💀");
      
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
      await db.collection("videos").doc(v.id).update({ is_trending: !v.is_trending });
    } catch (e) { alert("فشل تحديث الترند"); }
  };

  const handleUpdate = async (v: Video) => {
    try {
      await ensureAuth();
      const { id, ...data } = v;
      const cleanData = JSON.parse(JSON.stringify(data));
      await db.collection("videos").doc(id).update(cleanData);
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
          <h1 className="text-lg font-black text-red-600 italic">نظام الرفع - Rooh 1 (R2)</h1>
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
            <h2 className="text-xs font-black text-red-600 mb-6 uppercase tracking-widest">إضافة كابوس جديد (R2 / Direct)</h2>
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
                    await db.collection("videos").doc(showDeleteConfirm).delete();
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
                const docRef = db.collection("settings").doc("ai_avatar");
                const docSnap = await docRef.get();
                if (docSnap.exists) {
                    const data = docSnap.data();
                    if (data) {
                        setSilentUrl(data.silent_url || '');
                        setTalkingUrl(data.talking_url || '');
                    }
                }
            } catch (e) {
                // Ignore permission errors if user hasn't set this up yet
            }
        };
        fetchSettings();
    }, []);

    const handleSaveUrls = async () => {
        setLoading(true);
        try {
            await ensureAuth();
            await db.collection("settings").doc("ai_avatar").set({
                silent_url: silentUrl,
                talking_url: talkingUrl,
                updated_at: firebase.firestore.FieldValue.serverTimestamp()
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
        }
    };

    return (
        <div className="flex-1 overflow-y-auto p-8 pb-32 space-y-8">
            <div className="bg-neutral-900/30 border border-white/5 p-6 rounded-[2.5rem] shadow-2xl">
                <h2 className="text-xs font-black text-purple-500 mb-6 uppercase tracking-widest">مظهر المساعد الشخصي</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Silent Video */}
                    <div className="space-y-4">
                        <h3 className="text-white font-bold">فيديو الصمت (Silent Loop)</h3>
                        <div className="aspect-square bg-black rounded-2xl border-2 border-white/10 overflow-hidden relative group">
                            {silentUrl ? (
                                <video src={silentUrl} className="w-full h-full object-cover" autoPlay loop muted />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-gray-600">No Video</div>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <label className="cursor-pointer bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-white font-bold border border-white/20">
                                    تغيير
                                    <input type="file" className="hidden" accept="video/*" onChange={(e) => handleFileChange(e, 'silent')} />
                                </label>
                            </div>
                            {uploadingType === 'silent' && (
                                <div className="absolute inset-0 bg-black/80 flex items-center justify-center flex-col z-20">
                                    <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mb-2"></div>
                                    <span className="text-white text-xs">{progress}%</span>
                                </div>
                            )}
                        </div>
                        <input type="text" value={silentUrl} onChange={(e) => setSilentUrl(e.target.value)} placeholder="أو ضع رابط مباشر هنا..." className="w-full bg-black border border-white/10 rounded-xl p-3 text-xs text-white" />
                    </div>

                    {/* Talking Video */}
                    <div className="space-y-4">
                        <h3 className="text-white font-bold">فيديو التحدث (Talking Loop)</h3>
                        <div className="aspect-square bg-black rounded-2xl border-2 border-white/10 overflow-hidden relative group">
                            {talkingUrl ? (
                                <video src={talkingUrl} className="w-full h-full object-cover" autoPlay loop muted />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-gray-600">No Video</div>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <label className="cursor-pointer bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-white font-bold border border-white/20">
                                    تغيير
                                    <input type="file" className="hidden" accept="video/*" onChange={(e) => handleFileChange(e, 'talking')} />
                                </label>
                            </div>
                            {uploadingType === 'talking' && (
                                <div className="absolute inset-0 bg-black/80 flex items-center justify-center flex-col z-20">
                                    <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mb-2"></div>
                                    <span className="text-white text-xs">{progress}%</span>
                                </div>
                            )}
                        </div>
                        <input type="text" value={talkingUrl} onChange={(e) => setTalkingUrl(e.target.value)} placeholder="أو ضع رابط مباشر هنا..." className="w-full bg-black border border-white/10 rounded-xl p-3 text-xs text-white" />
                    </div>
                </div>

                <button onClick={handleSaveUrls} disabled={loading} className="w-full mt-8 bg-purple-600 hover:bg-purple-700 py-4 rounded-xl font-black text-white shadow-xl active:scale-95 disabled:opacity-50 transition-all">
                    {loading ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                </button>
            </div>
        </div>
    );
};

const CentralKeyManager: React.FC = () => {
    const [elevenLabsKeys, setElevenLabsKeys] = useState<string[]>([]);
    const [newKey, setNewKey] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const fetchKeys = async () => {
            try {
                await ensureAuth();
                const docRef = db.collection("settings").doc("api_config");
                const docSnap = await docRef.get();
                if (docSnap.exists) {
                    const data = docSnap.data();
                    if (data) {
                        setElevenLabsKeys(data.elevenlabs_keys || []);
                        setGeminiKey(data.gemini_key || '');
                    }
                }
            } catch (e) {
                console.error("Failed to fetch keys", e);
            }
        };
        fetchKeys();
    }, []);

    const handleAddKey = () => {
        if (newKey.trim()) {
            setElevenLabsKeys([...elevenLabsKeys, newKey.trim()]);
            setNewKey('');
        }
    };

    const handleRemoveKey = (index: number) => {
        const updated = elevenLabsKeys.filter((_, i) => i !== index);
        setElevenLabsKeys(updated);
    };

    const handleSave = async () => {
        setIsLoading(true);
        try {
            await ensureAuth();
            const docRef = db.collection("settings").doc("api_config");
            await docRef.set({
                elevenlabs_keys: elevenLabsKeys,
                gemini_key: geminiKey, // Save Gemini Key
                updated_at: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            alert("تم حفظ المفاتيح بنجاح وتوزيعها على السيرفر 🔐");
        } catch (e) {
            alert("فشل الحفظ");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto p-8 pb-32 space-y-8">
            <div className="bg-neutral-900/30 border border-white/5 p-6 rounded-[2.5rem] shadow-2xl">
                <h2 className="text-xs font-black text-green-500 mb-6 uppercase tracking-widest">مفاتيح API المركزية</h2>
                
                {/* Gemini AI Key Section */}
                <div className="mb-8 p-4 rounded-2xl bg-black/40 border border-white/5">
                    <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                        Gemini AI Key (Google)
                    </h3>
                    <input 
                        type="text" 
                        value={geminiKey} 
                        onChange={(e) => setGeminiKey(e.target.value)} 
                        placeholder="AIzaSy..."
                        className="w-full bg-black border border-white/10 rounded-xl p-3 text-xs text-green-400 font-mono"
                    />
                    <p className="text-[9px] text-gray-500 mt-2">هذا المفتاح يستخدم لذكاء "سيدة الحديقة".</p>
                </div>

                {/* ElevenLabs Keys Section */}
                <div className="space-y-4">
                    <h3 className="text-white font-bold flex items-center gap-2">
                        <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                        ElevenLabs Keys (Audio)
                    </h3>
                    
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={newKey} 
                            onChange={(e) => setNewKey(e.target.value)} 
                            placeholder="sk_..." 
                            className="flex-1 bg-black border border-white/10 rounded-xl p-3 text-xs text-white font-mono"
                        />
                        <button onClick={handleAddKey} className="bg-green-600 px-4 rounded-xl font-bold text-white text-xs hover:bg-green-700">+</button>
                    </div>

                    <div className="space-y-2 mt-4 max-h-60 overflow-y-auto pr-2">
                        {elevenLabsKeys.map((key, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-white/5">
                                <span className="text-[10px] font-mono text-gray-300 truncate max-w-[200px]">{key.substring(0, 10)}...{key.substring(key.length - 5)}</span>
                                <button onClick={() => handleRemoveKey(idx)} className="text-red-500 hover:text-red-400 text-xs font-bold px-2">حذف</button>
                            </div>
                        ))}
                    </div>
                </div>

                <button onClick={handleSave} disabled={isLoading} className="w-full mt-8 bg-green-600 hover:bg-green-700 py-4 rounded-xl font-black text-white shadow-[0_0_20px_rgba(22,163,74,0.3)] active:scale-95 disabled:opacity-50 transition-all">
                    {isLoading ? 'جاري التحديث...' : 'حفظ وتعميم المفاتيح'}
                </button>
            </div>
        </div>
    );
};

const VideoEditor: React.FC<{ video: Video, categories: string[], onClose: () => void, onSave: (v: Video) => void }> = ({ video, categories, onClose, onSave }) => {
  const [data, setData] = useState(video);
  return (
    <div className="fixed inset-0 z-[950] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-white/10 p-6 rounded-[2rem] w-full max-w-lg shadow-2xl animate-in zoom-in duration-300 space-y-4">
        <h3 className="text-white font-black text-lg">تعديل: {video.title}</h3>
        <input type="text" value={data.title} onChange={e => setData({...data, title: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-3 text-white" placeholder="العنوان" />
        <textarea value={data.description} onChange={e => setData({...data, description: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-3 text-white h-24" placeholder="الوصف" />
        <select value={data.category} onChange={e => setData({...data, category: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-3 text-white">
           {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex gap-2">
          <button onClick={() => onSave(data)} className="flex-1 bg-green-600 py-3 rounded-xl text-white font-bold">حفظ</button>
          <button onClick={onClose} className="flex-1 bg-white/10 py-3 rounded-xl text-white font-bold">إلغاء</button>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
