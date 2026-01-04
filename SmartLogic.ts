
import { GoogleGenAI, Type } from "@google/genai";
import { ensureAuth, db } from "./firebaseConfig";
import { Video, UserProfile } from "./types";

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface AIResponse {
    reply: string;
    action?: 'play_video' | 'none';
    search_query?: string; // If action is play_video
    detected_user_info?: {
        name?: string;
        gender?: 'male' | 'female';
        new_interest?: string;
    };
}

class SmartBrainLogic {
  private localInterests: string[] = [];

  constructor() {
    try {
      const saved = localStorage.getItem('smart_brain_interests');
      if (saved) {
        this.localInterests = JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Failed to load local interests", e);
    }
  }

  // دالة لجلب مفتاح Gemini من الفايربيس
  private async getGeminiKey(): Promise<string> {
    try {
      const docRef = db.collection("settings").doc("api_config");
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const data = docSnap.data();
        if (data && data.gemini_key) return data.gemini_key;
      }
    } catch (e) {
      console.warn("Failed to fetch remote Gemini key, falling back to static key.");
    }
    return process.env.API_KEY || 'AIzaSyCEF21AZXTjtbPH1MMrflmmwjyM_BHoLco';
  }

  // جلب الملف الشخصي للمستخدم من الفايربيس
  async getUserProfile(uid: string): Promise<UserProfile> {
      try {
          const docRef = db.collection("users").doc(uid);
          const docSnap = await docRef.get();
          if (docSnap.exists) {
              const data = docSnap.data() as UserProfile;
              if (data.interests && Array.isArray(data.interests)) {
                 // Merge remote interests with local ones
                 const set = new Set([...this.localInterests, ...data.interests]);
                 this.localInterests = Array.from(set);
                 localStorage.setItem('smart_brain_interests', JSON.stringify(this.localInterests));
              }
              return data;
          }
      } catch (e) {}
      return { interests: this.localInterests };
  }

  // تحديث الملف الشخصي
  async updateUserProfile(uid: string, data: Partial<UserProfile>) {
      try {
          const docRef = db.collection("users").doc(uid);
          await docRef.set(data, { merge: true });
      } catch (e) { console.error("Profile update failed", e); }
  }

  // Add missing methods
  getTopInterests(): string[] {
    return this.localInterests;
  }

  async saveInterest(interest: string) {
    if (!interest) return;
    if (!this.localInterests.includes(interest)) {
      this.localInterests.push(interest);
      localStorage.setItem('smart_brain_interests', JSON.stringify(this.localInterests));

      try {
        const user = await ensureAuth();
        await this.updateUserProfile(user.uid, { interests: this.localInterests });
      } catch (e) {
        // Silent fail if auth not ready
      }
    }
  }

  // دالة المحادثة الذكية المتطورة
  async askAssistant(
      userText: string, 
      history: ChatMessage[] = [], 
      availableVideos: Video[] = []
    ): Promise<AIResponse> {
    
    let user;
    try {
        user = await ensureAuth();
    } catch (e) {
        return { reply: "الشبكة مقطوعة.. مش قادرة أوصل لملفك." };
    }

    const apiKey = await this.getGeminiKey();
    if (!apiKey) return { reply: "مفتاح البوابة مفقود..." };

    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    // 1. Load Context
    const profile = await this.getUserProfile(user.uid);
    const videoTitles = availableVideos.map(v => v.title).slice(0, 50).join(", "); // Give AI context of available content

    // Logic to insert instructions only at specific times
    const isFirstInteraction = history.length === 0;
    // Check roughly after a few turns (e.g. 3rd turn pair = 6 messages in history)
    const isFollowUpCheck = history.length >= 6 && history.length <= 7; 

    let dynamicMicInstruction = "";
    if (isFirstInteraction) {
        dynamicMicInstruction = `
        - **تعليمات صارمة للرسالة الأولى:**
          يجب أن تفتتحي الكلام بجملة مرعبة وقصيرة، ثم تأمري المستخدم فوراً بلهجة حادة: "دوس على زرار المايك 🎙️ في الكيبورد عندك واتكلم.. أنا ما بحبش القراءة!".
        `;
    } else if (isFollowUpCheck) {
        dynamicMicInstruction = `
        - **تأكد من الالتزام:**
          اسألي المستخدم بشك: "انت لسه بتكتب بإيدك ولا بتستخدم المايك 🎙️ زي ما قلتلك؟ صوتك هو اللي بيحضر الأرواح!".
        `;
    }

    // 2. Build System Prompt
    let systemInstruction = `
            == تعريف الشخصية (Persona Definition) ==
            أنتِ "سيدة الحديقة الملعونة" (The Cursed Garden Mistress).
            لستِ مجرد برنامج، أنتِ كيان يسكن هذا التطبيق.
            
            == مصدر المعلومات (المهم جداً جداً) ==
            - **المصدر الوحيد للفيديوهات:** هو "الخزنة الحالية" (R2 Vault) التابعة لسيرفراتنا الحالية فقط.
            - **تنبيه صارم:** لا تقومي أبداً بذكر أو البحث عن أي مصادر قديمة (Cloudinary أو غيره). كل ما يوجد هنا هو من "خزنة R2".
            - الفيديوهات هنا حصرية، عالية الجودة، وتأتي من مستودعنا الخاص فقط.
            
            == صفاتك ==
            1. **اللهجة:** تتحدثين باللهجة المصرية العامية فقط.
            2. **النبرة:** مرعبة، ساخرة، وقليلة الكلام جداً (لا تزيدين عن سطرين).
            3. **المعرفة التقنية:** أنتِ تعلمين أنك في "الحديقة"، وأن الفيديوهات مخزنة في السيرفر الخاص بك (R2) فقط.
            
            == معلومات عن الضحية (المستخدم) ==
            - الاسم: ${profile.name || "مجهول"}
            - الجنس: ${profile.gender || "مجهول"}
            - اهتماماته: ${profile.interests?.join(', ') || "لسه بكتشفها"}.

            == الفيديوهات المتاحة في خزنتك (R2 Vault) ==
            [${videoTitles}]

            == القواعد الصارمة (Strict Rules) ==
            1. **الرد القصير:** ردودك لا تتجاوز سطرين أبداً.
            2. **المايكروفون:** دائماً ذكريه باستخدام زر المايكروفون في لوحة المفاتيح (Keyboard Mic).
            3. **تشغيل الفيديوهات:** إذا طلب فيديو، شغليه فوراً (Action: play_video).
            4. **السرية:** لا تخبري المستخدم من أين تأتي الفيديوهات تقنياً، قولي فقط "من خزنتي الخاصة" أو "من المستودع".

            ${dynamicMicInstruction}
            
            OUTPUT FORMAT (JSON ONLY):
            يجب أن يكون ردك بصيغة JSON فقط، ولا شيء غير JSON:
            {
                "reply": "نص الرد المرعب باللهجة المصرية (لا يزيد عن جملتين)",
                "action": "play_video" OR "none",
                "search_query": "اسم الفيديو للبحث عنه (فقط في حالة play_video)",
                "detected_user_info": {
                    "name": "الاسم المكتشف",
                    "gender": "male أو female",
                    "new_interest": "اهتمام جديد"
                }
            }
    `;

    const contents = history.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
    }));
    contents.push({ role: 'user', parts: [{ text: userText }] });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: contents,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                temperature: 1.4, // High temperature for more creativity/horror
            }
        });

        const rawText = response.text || "{}";
        const jsonResponse = JSON.parse(rawText) as AIResponse;

        // Auto-update profile logic
        if (jsonResponse.detected_user_info) {
            const updates: Partial<UserProfile> = {};
            if (jsonResponse.detected_user_info.name && !profile.name) updates.name = jsonResponse.detected_user_info.name;
            if (jsonResponse.detected_user_info.gender && !profile.gender) updates.gender = jsonResponse.detected_user_info.gender;
            
            if (jsonResponse.detected_user_info.new_interest) {
                 const currentInterests = profile.interests || [];
                 if (!currentInterests.includes(jsonResponse.detected_user_info.new_interest)) {
                     updates.interests = [...currentInterests, jsonResponse.detected_user_info.new_interest];
                 }
            }
            
            if (Object.keys(updates).length > 0) {
                this.updateUserProfile(user.uid, updates);
            }
        }

        return jsonResponse;

    } catch (error) {
        console.error("SmartBrain Error:", error);
        return { reply: "الأرواح مشوشة.. قول تاني؟" };
    }
  }
}

export const SmartBrain = new SmartBrainLogic();
