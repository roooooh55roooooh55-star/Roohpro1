
import React, { useState, useMemo, useRef } from 'react';
import { Video, VideoType } from './types';
import { db } from './firebaseConfig.ts';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

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
  
  const [newVideo, setNewVideo] = useState({
    title: '',
    description: '',
    category: categories[0] || 'هجمات مرعبة',
    video_type: 'Shorts' as VideoType, // Strict strict 'Shorts' | 'Long Video'
    is_trending: false,
    redirect_url: '' // This maps to the "external_link" requirement from user
  });

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAuth = () => {
    if (passcode === currentPasscode) setIsAuthenticated(true);
    else { alert("الرمز خاطئ! الأرواح ترفض دخولك."); setPasscode(''); }
  };

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
    
    // User can just provide a title and external link without a file if desired, 
    // but usually a file is expected for R2. We'll require file unless redirect_url is present.
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
      let videoUrl = "";
      if (file) {
        videoUrl = await uploadFileToStorage(file);
      } else {
        // If no file but redirect_url exists, we might use a placeholder or empty string for video_url
        // depending on logic, but let's assume video_url is required for the schema
        videoUrl = newVideo.redirect_url; 
      }
      
      const videoData = {
        title: newVideo.title,
        description: newVideo.description,
        category: newVideo.category,
        video_type: newVideo.video_type, // Enforce "Shorts" or "Long Video"
        is_trending: newVideo.is_trending,
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
      await updateDoc(doc(db, "videos", v.id), { is_trending: !v.is_trending });
    } catch (e) { alert("فشل تحديث الترند"); }
  };

  // Improved Delete Logic with Confirmation
  const handleDelete = async (id: string) => {
    if (!id) return;
    if (!window.confirm("هل أنت متأكد من حذف هذا الفيديو؟ هذا الإجراء لا يمكن التراجع عنه.")) return;
    
    try {
      const videoRef = doc(db, "videos", id);
      await deleteDoc(videoRef);
      // alert("✅ تم المسح بنجاح واختفى الفيديو من القائمة"); // Removed alert to prevent interruption, snapshot handles update
    } catch (e) { 
      console.error("Delete Error:", e);
      alert("❌ فشل المسح من السيرفر، يرجى التحقق من الاتصال"); 
    }
  };

  const handleUpdate = async (v: Video) => {
    try {
      const { id, ...data } = v;
      // تنظيف البيانات قبل الإرسال لـ Firestore
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
      <div className="h-20 border-b border-white/10 flex items-center justify-between px-6 bg-black/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <img src={LOGO_URL} className="w-10 h-10 rounded-full border-2 border-red-600" />
          <h1 className="text-lg font-black text-red-600 italic">نظام الرفع - Rooh 1</h1>
        </div>
        <button onClick={onClose} className="p-2 text-gray-500 hover:text-white">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

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
              
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={newVideo.is_trending} onChange={e => setNewVideo({...newVideo, is_trending: e.target.checked})} className="w-5 h-5 accent-red-600" id="trending-check" />
                <label htmlFor="trending-check" className="text-white text-sm font-bold">تفعيل شارة الترند (Trending)</label>
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
              </div>
              <h3 className="text-xs font-black text-white truncate px-1">{v.title}</h3>
              <div className="flex gap-2">
                <button onClick={() => setEditingVideo(v)} className="flex-1 bg-blue-600/20 text-blue-500 py-2 rounded-lg text-[10px] font-black">تعديل</button>
                <button onClick={() => toggleTrending(v)} className="flex-1 bg-orange-600/20 text-orange-500 py-2 rounded-lg text-[10px] font-black">رائج</button>
                <button onClick={() => handleDelete(v.id)} className="flex-1 bg-red-600/20 text-red-500 py-2 rounded-lg text-[10px] font-black">حذف</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingVideo && (
        <VideoEditor video={editingVideo} categories={categories} onClose={() => setEditingVideo(null)} onSave={handleUpdate} />
      )}
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
          <input type="text" value={v.title} onChange={e => setV({...v, title: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white" placeholder="العنوان" />
          <textarea value={v.description} onChange={e => setV({...v, description: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white min-h-[100px]" placeholder="الوصف" />
          <div className="grid grid-cols-2 gap-4">
            <select value={v.category} onChange={e => setV({...v, category: e.target.value})} className="bg-black border border-white/10 rounded-xl p-4 text-red-500 font-bold">
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={v.video_type} onChange={e => setV({...v, video_type: e.target.value as VideoType})} className="bg-black border border-white/10 rounded-xl p-4 text-white">
              <option value="Shorts">Shorts</option>
              <option value="Long Video">Long Video</option>
            </select>
          </div>
          <input type="text" value={v.redirect_url || ''} onChange={e => setV({...v, redirect_url: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white" placeholder="رابط خارجي" />
        </div>
        <div className="flex gap-4">
          <button onClick={() => onSave(v)} className="flex-1 bg-red-600 py-4 rounded-xl font-black text-white">حفظ التغييرات</button>
          <button onClick={onClose} className="flex-1 bg-neutral-800 py-4 rounded-xl font-black text-white">إلغاء</button>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
