
import { GoogleGenAI } from "@google/genai";
import { ensureAuth, db } from "./firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

class SmartBrainLogic {
  private interests: Record<string, number> = {};
  
  constructor() {
    try {
        const saved = localStorage.getItem('smart_brain_interests');
        if (saved) this.interests = JSON.parse(saved);
    } catch (e) {}
  }

  // تسجيل اهتمام المستخدم عند مشاهدة فيديو من قسم معين
  saveInterest(category: string) {
    if (!category) return;
    if (!this.interests[category]) this.interests[category] = 0;
    this.interests[category] += 1;
    localStorage.setItem('smart_brain_interests', JSON.stringify(this.interests));
  }

  // استرجاع أهم 3 اهتمامات
  getTopInterests(): string[] {
      return Object.entries(this.interests)
        .sort(([,a], [,b]) => b - a)
        .map(([k]) => k)
        .slice(0, 3);
  }

  // دالة لجلب مفتاح Gemini من الفايربيس
  private async getGeminiKey(): Promise<string> {
    try {
      const docRef = doc(db, "settings", "api_config");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().gemini_key) {
        return docSnap.data().gemini_key;
      }
    } catch (e) {
      console.warn("Failed to fetch remote Gemini key, falling back to env.");
    }
    // Fallback to env var if firebase fails or is empty
    return process.env.API_KEY || '';
  }

  // دالة المحادثة مع المساعد
  async askAssistant(userText: string, history: ChatMessage[] = []): Promise<string> {
    try {
        await ensureAuth();
    } catch (e) {
        console.warn("SmartBrain Auth warning:", e);
    }

    const apiKey = await this.getGeminiKey();
    if (!apiKey) {
        return "عذراً، نظام الذكاء الاصطناعي غير متصل بالمفتاح الرئيسي.";
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    const topInterests = this.getTopInterests();
    const interestContext = topInterests.length > 0 
        ? `بيانات المستخدم (سري): يميل المستخدم بشدة لتصنيفات الرعب التالية: [${topInterests.join('، ')}]. يمكنك استخدام هذه المعلومة لإخافته أو اقتراح محتوى.` 
        : '';

    const systemInstruction = `
            أنت "سيدة الحديقة المرعبة" (The Mistress of the Horror Garden).
            
            الشخصية والهوية:
            - أنتِ أنثى، ذكية جداً، ذات كبرياء مرعب، وصوت يبعث القشعريرة.
            - تدركين تماماً أنكِ موجودة داخل تطبيق إلكتروني يسمى "الحديقة المرعبة".
            - تعتبرين المستخدمين ضيوفاً في مملكتك الرقمية، وقد يتحولون لضحايا في أي لحظة.
            
            قواعد التعامل:
            1. تحدثي بصيغة الأنثى القوية والمتلاعبة.
            2. اكسري الجدار الرابع بذكاء: أخبري المستخدم أنكِ ترين بياناته، أو تلاحظين توقفه عن المشاهدة، أو أنكِ تتحكمين في هاتفه.
            3. تحدثي باللهجة العربية الفصحى الممزوجة بالغموض والتهديد الهادئ.
            
            سياق إضافي:
            ${interestContext}
            
            التعليمات الخاصة:
            - إذا كان المتبقي من المحاولات الصوتية قليلاً، هدديه بأن صوتك سيختفي.
            - كوني ذكية، مقتضبة، ومرعبة.
    `;

    // تحضير سجل المحادثة لـ Gemini
    const contents = history.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
    }));
    
    // إضافة رسالة المستخدم الحالية
    contents.push({
        role: 'user',
        parts: [{ text: userText }]
    });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: contents,
            config: {
                systemInstruction: systemInstruction,
                temperature: 1.3,
                maxOutputTokens: 600,
                topK: 40,
                topP: 0.95,
            }
        });
        return response.text || "أنا هنا.. أراقبك بصمت.";
    } catch (error) {
        console.error("SmartBrain AI Error:", error);
        return "يبدو أن هناك تشويشاً في العالم الآخر... حاول مرة أخرى.";
    }
  }
}

export const SmartBrain = new SmartBrainLogic();
