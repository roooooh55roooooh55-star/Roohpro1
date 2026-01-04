
import React, { useState, useRef, useEffect } from 'react';
import { playNarrative, stopCurrentNarrative, subscribeToAudioState } from './elevenLabsManager';
import { doc, getDoc } from 'firebase/firestore';
import { db, ensureAuth } from './firebaseConfig';
import { SmartBrain, ChatMessage } from './SmartLogic'; // Import SmartBrain

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
  
  // We maintain history for context but do NOT render it
  const [history, setHistory] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('al-hadiqa-ai-history-v6');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  const [visibleMessage, setVisibleMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); // Thinking State
  const [isAudioPlaying, setIsAudioPlaying] = useState(false); // 11Labs Audio State

  // Video URL States
  const [silentUrl, setSilentUrl] = useState('');
  const [talkingUrl, setTalkingUrl] = useState('');

  // Audio Quota State (Limit to 5 per session)
  const [voiceCount, setVoiceCount] = useState(0);
  const isLimitReached = voiceCount >= 5;

  // Dragging State
  const [position, setPosition] = useState<{x: number, y: number} | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef<{x: number, y: number} | null>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const hasMoved = useRef(false);
  const messageTimeoutRef = useRef<any>(null);

  // Fetch AI Avatar Video URLs on Mount
  useEffect(() => {
    const fetchAvatarSettings = async () => {
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
            console.debug("Note: AI settings fetch failed or permissions denied.");
        }
    };
    fetchAvatarSettings();
  }, []);

  // Listen for audio state changes
  useEffect(() => {
    const unsubscribe = subscribeToAudioState((isPlaying) => {
        setIsAudioPlaying(isPlaying);
    });
    return () => unsubscribe();
  }, []);

  const isTalking = isAudioPlaying;

  useEffect(() => {
    localStorage.setItem('al-hadiqa-ai-history-v6', JSON.stringify(history));
  }, [history]);

  // Handle Drag Events
  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (isOpen) return; 
    setIsDragging(true);
    hasMoved.current = false;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      dragStartPos.current = { x: clientX - rect.left, y: clientY - rect.top };
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
    setPosition({ x: Math.max(0, Math.min(newX, maxX)), y: Math.max(0, Math.min(newY, maxY)) });
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
      // First interaction message if empty
      if (history.length === 0) {
           const initialMsg = 'أهلاً بك في حديقتي.. هل تجرؤ على الحديث؟';
           setVisibleMessage(initialMsg);
           // Clear after 5 seconds if not interacting
           messageTimeoutRef.current = setTimeout(() => setVisibleMessage(null), 5000);
      }
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    stopCurrentNarrative();
    if (onRefresh) onRefresh();
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || loading) return;

    stopCurrentNarrative();
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);

    const userMessage = inputText.trim();
    setInputText('');
    
    // Update history but don't show user message in UI
    const newHistory: ChatMessage[] = [...history, { role: 'user', text: userMessage }];
    setHistory(newHistory);
    
    setLoading(true); 
    setVisibleMessage(null); // Clear previous message while thinking

    try {
      // Pass "isLimitReached" to SmartBrain to enforce scary behavior if quota full
      const modelResponse = await SmartBrain.askAssistant(userMessage, newHistory, isLimitReached);
      
      setHistory(prev => [...prev, { role: 'model', text: modelResponse }]);
      
      // Show message immediately
      setVisibleMessage(modelResponse);

      // TTS Logic
      if (!isLimitReached) {
        const speakableText = cleanTextForSpeech(modelResponse);
        if (speakableText) {
          playNarrative(speakableText);
          setVoiceCount(prev => prev + 1);
          
          // Hide message after a longer duration (approx reading time + buffer)
          // Average speaking rate: ~150 words/min. 
          const wordCount = modelResponse.split(' ').length;
          const readTime = Math.max(4000, (wordCount / 2) * 1000); // Min 4s
          
          messageTimeoutRef.current = setTimeout(() => {
              setVisibleMessage(null);
          }, readTime);
        }
      } else {
        // Voice limit reached - Text only, stays longer
        messageTimeoutRef.current = setTimeout(() => {
            setVisibleMessage(null);
        }, 8000);
      }

    } catch (error) {
      console.error("AI Error:", error);
      setVisibleMessage("حدث خلل في الأرواح.. ابتعد الآن.");
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
        <div className="fixed inset-0 z-[1000] bg-black">
          
          {/* 
            FIXED TOP SECTION: Video
            Does not move when keyboard opens.
            Takes up 55% of the screen height.
          */}
          <div className="fixed top-0 left-0 w-full h-[55%] z-0 bg-black border-b-2 border-red-900/50 shadow-[0_10px_40px_rgba(220,38,38,0.1)] overflow-hidden">
              
              {/* Close Button - Always visible on top of video */}
              <button 
                onClick={handleClose} 
                className="absolute top-4 left-4 z-50 bg-black/40 backdrop-blur-md p-3 rounded-full text-white/70 hover:text-red-500 border border-white/10 hover:border-red-500 transition-all active:scale-90"
              >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>

              {/* Status & Quota Indicator */}
              <div className="absolute top-4 right-4 z-50 flex flex-col items-end gap-1">
                 <div className="flex items-center gap-2 bg-black/60 px-3 py-1 rounded-full border border-red-600/20 backdrop-blur-md">
                    <div className={`w-2 h-2 rounded-full ${isTalking ? 'bg-green-500 animate-pulse shadow-[0_0_10px_lime]' : 'bg-red-600'}`}></div>
                    <span className="text-[10px] font-black text-white/80 uppercase tracking-widest">{isTalking ? 'SPEAKING' : 'LISTENING'}</span>
                 </div>
                 {isLimitReached && (
                     <span className="text-[9px] text-red-500 font-black bg-black/80 px-2 py-0.5 rounded border border-red-500 animate-pulse">VOICE DEPLETED</span>
                 )}
              </div>

              {/* Videos */}
              {silentUrl && (
                  <video 
                    src={silentUrl} 
                    muted loop autoPlay playsInline 
                    preload="auto"
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-100 ${isTalking ? 'opacity-0' : 'opacity-100'}`}
                  />
              )}
              {talkingUrl && (
                  <video 
                    src={talkingUrl} 
                    muted loop autoPlay playsInline 
                    preload="auto"
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-100 ${isTalking ? 'opacity-100' : 'opacity-0'}`}
                  />
              )}
              
              {/* Fallback Loader */}
              {!silentUrl && !talkingUrl && (
                  <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 text-gray-500 flex-col gap-4">
                      <div className="relative w-24 h-24 flex items-center justify-center">
                          <div className="absolute inset-0 rounded-full border-t-2 border-b-2 border-red-600 border-l-transparent border-r-transparent animate-spin shadow-[0_0_30px_#dc2626] opacity-80" style={{ animationDuration: '1.5s' }}></div>
                          <div className="absolute inset-2 rounded-full border-l-2 border-r-2 border-yellow-500 border-t-transparent border-b-transparent animate-spin shadow-[0_0_20px_#eab308] opacity-80" style={{ animationDirection: 'reverse', animationDuration: '2s' }}></div>
                          <img 
                            src="https://i.top4top.io/p_3643ksmii1.jpg" 
                            className="w-16 h-16 rounded-full object-cover border border-white/20 shadow-[0_0_25px_rgba(220,38,38,0.8)] animate-pulse z-10" 
                            alt="Loading"
                          />
                      </div>
                      <span className="text-xs font-bold text-red-500/80 animate-pulse tracking-widest">حارس الحديقه مشغول الان ارجو الانتظار</span>
                  </div>
              )}
              
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30 pointer-events-none"></div>

              {/* 
                MESSAGE OVERLAY (Subtitles Style)
                Appears at the bottom of the video container.
              */}
              <div className="absolute bottom-6 left-0 right-0 z-40 px-6 flex flex-col items-center justify-end min-h-[100px] pointer-events-none">
                  {/* Thinking Indicator */}
                  {loading && (
                      <div className="mb-2 bg-red-950/40 text-red-500 px-4 py-1 rounded-full text-[10px] font-black animate-pulse border border-red-600/20 backdrop-blur-sm">
                          جاري استدعاء الروح...
                      </div>
                  )}

                  {/* The Message Itself */}
                  {visibleMessage && !loading && (
                      <div className="animate-in slide-in-from-bottom-5 fade-in duration-500 max-w-md">
                          <div className={`bg-black/60 backdrop-blur-md border border-white/10 p-4 rounded-2xl text-center shadow-[0_0_30px_rgba(0,0,0,0.8)] ${isLimitReached ? 'border-red-600/60 shadow-[0_0_20px_red]' : ''}`}>
                              <p className={`text-base md:text-lg font-bold leading-relaxed ${isLimitReached ? 'text-red-500' : 'text-gray-200'}`}>
                                  "{visibleMessage}"
                              </p>
                          </div>
                      </div>
                  )}
              </div>
          </div>

          {/* 
            INPUT SECTION
            Moved to TOP 55% to sit directly under the video frame.
          */}
          <div className="fixed top-[55%] left-0 w-full z-50 bg-black border-t border-white/10">
             
             {/* Gradient Fade to merge with video */}
             <div className="absolute -top-10 left-0 right-0 h-10 bg-gradient-to-t from-black to-transparent pointer-events-none"></div>

             {/* Limit Reached UI */}
             {isLimitReached && (
                 <div className="flex justify-center -mt-6 mb-2 relative z-20">
                     <button 
                       onClick={handleClose} 
                       className="bg-red-600 text-white px-6 py-2 rounded-full font-black text-xs shadow-[0_0_15px_red] animate-bounce active:scale-95"
                     >
                         إغلاق والذهاب للمشاهدة ✕
                     </button>
                 </div>
             )}

             <form 
                onSubmit={handleSendMessage}
                className="p-4 flex items-center gap-3 relative z-10"
              >
                <div className="flex-1 relative group">
                    <input 
                      type="text" 
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder={isLimitReached ? "نفذت المحاولات الصوتية..." : "اكتب رسالتك للسيدة..."} 
                      disabled={loading}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white text-sm outline-none focus:border-red-600 transition-colors placeholder:text-gray-600 disabled:opacity-50"
                      autoComplete="off"
                    />
                    <div className="absolute inset-0 rounded-2xl bg-red-600/5 blur-sm opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none"></div>
                </div>
                
                <button 
                  type="submit"
                  disabled={loading || !inputText.trim()}
                  className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] active:scale-90 disabled:opacity-50 disabled:grayscale transition-all"
                >
                  {loading ? (
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                      <svg className="w-6 h-6 rotate-180" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                      </svg>
                  )}
                </button>
              </form>
          </div>

        </div>
      )}
    </>
  );
};

export default AIOracle;
