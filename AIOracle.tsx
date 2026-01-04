
import React, { useState, useRef, useEffect } from 'react';
import { playNarrative, stopCurrentNarrative, subscribeToAudioState } from './elevenLabsManager';
import { doc, getDoc } from 'firebase/firestore';
import { db, ensureAuth } from './firebaseConfig';
import { SmartBrain } from './SmartLogic'; // Import SmartBrain

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface AIOracleProps {
  onRefresh?: () => void;
}

// Helper to remove emojis for TTS stability
const cleanTextForSpeech = (text: string) => {
  return text.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '').trim();
};

const AIOracle: React.FC<AIOracleProps> = ({ onRefresh }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('al-hadiqa-ai-history-v5');
      return saved ? JSON.parse(saved) : [
        { role: 'model', text: 'أهلاً بك في حديقتي.. هل تجرؤ على الحديث مع سيدتها؟' }
      ];
    } catch (e) { return []; }
  });
  const [loading, setLoading] = useState(false); // Thinking State
  const [isAudioPlaying, setIsAudioPlaying] = useState(false); // 11Labs Audio State
  const scrollRef = useRef<HTMLDivElement>(null);

  // Video URL States
  const [silentUrl, setSilentUrl] = useState('');
  const [talkingUrl, setTalkingUrl] = useState('');

  // Audio Quota State (Limit to 5 per session)
  const [voiceCount, setVoiceCount] = useState(0);

  // Dragging State
  const [position, setPosition] = useState<{x: number, y: number} | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef<{x: number, y: number} | null>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const hasMoved = useRef(false);

  // Fetch AI Avatar Video URLs on Mount
  useEffect(() => {
    const fetchAvatarSettings = async () => {
        try {
            // Ensure auth is ready before fetching to avoid permission errors
            await ensureAuth();
            
            const docRef = doc(db, "settings", "ai_avatar");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                setSilentUrl(data.silent_url || '');
                setTalkingUrl(data.talking_url || '');
            }
        } catch (e) {
            // Fail silently or log if needed, user might not have set these up yet
            console.debug("Note: AI settings fetch failed or permissions denied.");
        }
    };
    fetchAvatarSettings();
  }, []);

  // Listen for audio state changes from ElevenLabs Manager
  useEffect(() => {
    const unsubscribe = subscribeToAudioState((isPlaying) => {
        setIsAudioPlaying(isPlaying);
    });
    return () => unsubscribe();
  }, []);

  // Determine which video to show
  // Talking video active ONLY if Audio is playing (Strictly as requested)
  const isTalking = isAudioPlaying;

  useEffect(() => {
    localStorage.setItem('al-hadiqa-ai-history-v5', JSON.stringify(messages));
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isOpen]); // Scroll when messages change or modal opens

  // Handle Drag Events
  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (isOpen) return; 
    
    setIsDragging(true);
    hasMoved.current = false;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      dragStartPos.current = {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    }
  };

  const handlePointerMove = (e: MouseEvent | TouchEvent) => {
    if (!isDragging || !dragStartPos.current) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

    hasMoved.current = true;

    let newX = clientX - dragStartPos.current.x;
    let newY = clientY - dragStartPos.current.y;

    const maxX = window.innerWidth - 80; 
    const maxY = window.innerHeight - 80; 
    
    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartPos.current = null;
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handlePointerMove);
      window.addEventListener('mouseup', handlePointerUp);
      window.addEventListener('touchmove', handlePointerMove, { passive: false });
      window.addEventListener('touchend', handlePointerUp);
    } else {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    }
    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDragging]);

  const handleButtonClick = () => {
    if (!hasMoved.current) {
      setIsOpen(true);
      stopCurrentNarrative();
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    stopCurrentNarrative();
    if (onRefresh) {
      onRefresh(); // Trigger new videos on main page
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || loading) return;

    stopCurrentNarrative();

    const userMessage = inputText.trim();
    setInputText('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setLoading(true); 

    try {
      // 1. استدعاء العقل المدبر (SmartBrain) للحصول على الرد
      // نمرر سجل المحادثة السابق ليكون المساعد على دراية بالسياق
      const modelResponse = await SmartBrain.askAssistant(userMessage, messages);
      
      setMessages(prev => [...prev, { role: 'model', text: modelResponse }]);

      // TTS Logic - Stops speaking after 5 turns
      if (voiceCount < 5) {
        const speakableText = cleanTextForSpeech(modelResponse);
        if (speakableText) {
          playNarrative(speakableText); // Sets isAudioPlaying = true inside playNarrative flow
          setVoiceCount(prev => prev + 1);
        }
      } else {
        console.log("تم الوصول للحد الأقصى للصوت، الرد القادم نصي فقط");
      }

    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { role: 'model', text: "حدث خلل في النظام.. لكنني ما زلت أراك." }]);
    } finally {
      setLoading(false); 
    }
  };

  return (
    <>
      <div 
        ref={buttonRef}
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
        onClick={handleButtonClick}
        style={position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : { bottom: '6rem', right: '1.5rem' }}
        className={`fixed z-[100] w-20 h-20 flex items-center justify-center cursor-pointer transition-transform duration-100 ${isDragging ? 'scale-110 cursor-grabbing' : 'active:scale-95 cursor-grab'} touch-none select-none group`}
        title="سيدة الحديقة AI"
      >
        {isDragging && (
          <div className="absolute inset-0 rounded-full blur-2xl bg-gradient-to-tr from-cyan-400 via-purple-500 to-yellow-400 opacity-80 animate-pulse duration-75"></div>
        )}

        <div 
          className={`absolute w-full h-full rounded-full border-t-4 border-b-4 border-red-600 border-l-transparent border-r-transparent animate-spin ${isDragging ? 'shadow-[0_0_40px_#ef4444]' : 'shadow-[0_0_15px_rgba(220,38,38,0.6)]'}`} 
          style={{ animationDuration: isDragging ? '0.5s' : '1.5s' }}
        ></div>
        
        <div 
          className={`absolute w-[92%] h-[92%] rounded-full border-l-2 border-r-2 border-yellow-500 border-t-transparent border-b-transparent animate-spin ${isDragging ? 'shadow-[0_0_30px_#eab308]' : 'shadow-[0_0_10px_rgba(234,179,8,0.6)]'}`} 
          style={{ animationDirection: 'reverse', animationDuration: isDragging ? '0.8s' : '2s' }}
        ></div>

        <div className={`relative z-10 w-[85%] h-[85%] rounded-full overflow-hidden border-2 border-white/20 animate-pulse ${isDragging ? 'border-cyan-400 shadow-[0_0_20px_#22d3ee]' : 'shadow-[0_0_20px_rgba(220,38,38,0.8)]'}`}>
          <img 
            src="https://i.top4top.io/p_3643ksmii1.jpg" 
            className="w-full h-full object-cover opacity-90 pointer-events-none"
            alt="AI Avatar" 
          />
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[1000] bg-black flex flex-col animate-in fade-in zoom-in duration-300 overflow-hidden">
          
          {/* Top Half: Video Avatar Section (45% height) */}
          <div className="relative h-[45%] w-full bg-black border-b-2 border-red-600/30 overflow-hidden shadow-[0_10px_50px_rgba(220,38,38,0.2)]">
              {/* Close Button on Video (Triggers Refresh) */}
              <button 
                onClick={handleClose} 
                className="absolute top-4 left-4 z-50 bg-black/50 p-2 rounded-full text-white/70 hover:text-red-500 border border-white/10 hover:border-red-500 transition-all active:scale-90"
                title="إغلاق وإنعاش الفيديوهات"
              >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>

              {/* Status Indicator */}
              <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-black/60 px-3 py-1 rounded-full border border-red-600/20 backdrop-blur-md">
                 <div className={`w-2 h-2 rounded-full ${isTalking ? 'bg-green-500 animate-pulse shadow-[0_0_10px_lime]' : 'bg-red-600'}`}></div>
                 <span className="text-[10px] font-black text-white/80 uppercase tracking-widest">{isTalking ? 'SPEAKING' : 'LISTENING'}</span>
              </div>

              {/* Silent Video Loop - Shown when NOT talking */}
              {silentUrl && (
                  <video 
                    src={silentUrl} 
                    muted loop autoPlay playsInline 
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-100 ${isTalking ? 'opacity-0' : 'opacity-100'}`}
                  />
              )}
              
              {/* Talking Video Loop - Shown ONLY when talking */}
              {talkingUrl && (
                  <video 
                    src={talkingUrl} 
                    muted loop autoPlay playsInline 
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-100 ${isTalking ? 'opacity-100' : 'opacity-0'}`}
                  />
              )}

              {!silentUrl && !talkingUrl && (
                  <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 text-gray-500 flex-col gap-2">
                      <div className="w-16 h-16 border-4 border-red-900 border-t-red-600 rounded-full animate-spin"></div>
                      <span className="text-xs font-bold">بانتظار إشارة الفيديو...</span>
                  </div>
              )}

              {/* Overlay Gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30 pointer-events-none"></div>
          </div>

          {/* Bottom Half: Chat Section */}
          <div className="flex-1 flex flex-col bg-black/95 relative">
             <div className="absolute -top-6 left-0 right-0 h-6 bg-gradient-to-t from-black to-transparent z-10"></div>
             
             <div 
                ref={scrollRef} 
                className="flex-grow overflow-y-auto p-4 space-y-4 scroll-smooth"
                style={{ scrollbarWidth: 'none' }}
              >
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                    <div 
                      className={`max-w-[85%] p-4 rounded-2xl text-[13px] font-black shadow-xl leading-relaxed ${
                        msg.role === 'user' 
                          ? 'bg-white/5 text-gray-300 border border-white/10 rounded-tl-none' 
                          : 'bg-red-950/40 text-red-500 border border-red-900/30 rounded-tr-none'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-end">
                    <div className="bg-red-950/20 text-red-700 px-4 py-2 rounded-full text-[10px] font-black animate-pulse border border-red-900/10 flex items-center gap-2">
                      <span>السيدة تفكر...</span>
                      <span className="w-1 h-1 bg-red-600 rounded-full animate-ping"></span>
                    </div>
                  </div>
                )}
              </div>

              <form 
                onSubmit={handleSendMessage}
                className="p-4 bg-black border-t border-white/10 flex items-center gap-2 mb-safe"
              >
                <input 
                  type="text" 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="تحدث مع السيدة..." 
                  className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white text-sm outline-none focus:border-red-600 transition-colors placeholder:text-gray-600"
                />
                <button 
                  type="submit"
                  disabled={loading || !inputText.trim()}
                  className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] active:scale-90 disabled:opacity-50 disabled:grayscale transition-all"
                >
                  <svg className="w-6 h-6 rotate-180" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </button>
              </form>
          </div>
        </div>
      )}
    </>
  );
};

export default AIOracle;
