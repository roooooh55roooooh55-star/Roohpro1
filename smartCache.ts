
import { Video } from './types';

// حجم الجزء الذي سيتم تحميله (1.5 ميجابايت يكفي لـ 5-8 ثواني بجودة جيدة)
const BUFFER_SIZE = 1.5 * 1024 * 1024; 

export const initSmartBuffering = async (videos: Video[]) => {
  if (!navigator.onLine || !videos || videos.length === 0) return;

  // نقوم بترتيب الفيديوهات بحيث نبدأ بالأحدث أو الأكثر أهمية
  const queue = [...videos].slice(0, 15); // التركيز على أول 15 فيديو لعدم إرهاق المتصفح

  const bufferNext = async (index: number) => {
    if (index >= queue.length) return;

    const video = queue[index];
    if (!video || !video.video_url) {
        await bufferNext(index + 1);
        return;
    }

    try {
      // نستخدم fetch مع Range Header لطلب جزء محدد فقط من الملف
      // هذا يضع البيانات في "Disk Cache" الخاص بالمتصفح
      const response = await fetch(video.video_url, {
        headers: {
          'Range': `bytes=0-${BUFFER_SIZE}`
        },
        mode: 'cors' // Ensure CORS is handled
      });

      // يجب استهلاك البيانات ليقوم المتصفح بتخزينها فعلياً
      if (response.ok || response.status === 206) {
        await response.arrayBuffer();
        // console.log(`Buffered 5s for: ${video.title}`);
      }
    } catch (e) {
      // نتابع للفيديو التالي حتى لو فشل الحالي دون تحطيم التطبيق
      // console.warn(`Skipped buffering for ${video.id}`, e);
    }

    // الانتقال للفيديو التالي في القائمة
    await bufferNext(index + 1);
  };

  // بدء السلسلة
  bufferNext(0);
};
