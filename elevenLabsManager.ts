
import { db, ensureAuth } from './firebaseConfig';

// Singleton to manage the audio instance globally
let currentAudio: HTMLAudioElement | null = null;
type AudioStateListener = (isPlaying: boolean) => void;
let audioListeners: AudioStateListener[] = [];

const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel

export const subscribeToAudioState = (listener: AudioStateListener) => {
  audioListeners.push(listener);
  return () => {
    audioListeners = audioListeners.filter(l => l !== listener);
  };
};

const notifyListeners = (isPlaying: boolean) => {
  audioListeners.forEach(listener => listener(isPlaying));
};

export const stopCurrentNarrative = () => {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
    notifyListeners(false);
  }
};

// --- Smart Key Management System ---

// Helper to get the currently active key and its index
const getActiveKeyData = async () => {
  try {
    await ensureAuth();
    const docRef = db.collection("settings").doc("api_config");
    const snapshot = await docRef.get();
    
    if (!snapshot.exists) return null;
    
    const data = snapshot.data();
    if (!data) return null;

    const keys = data.elevenlabs_keys || [];
    let currentIndex = data.elevenlabs_index || 0;

    if (keys.length === 0) return null;

    // Safety check: wrap around if index is out of bounds
    if (currentIndex >= keys.length) {
        currentIndex = 0;
        // Optionally fix it in DB, but not blocking
    }

    return { key: keys[currentIndex], index: currentIndex, totalKeys: keys.length };
  } catch (error) {
    console.error("Failed to fetch ElevenLabs config:", error);
    return null;
  }
};

// Helper to switch to the next key in the pool
const switchToNextKey = async (oldIndex: number) => {
  try {
    const docRef = db.collection("settings").doc("api_config");
    // Simple increment. The getActiveKeyData logic handles the modulo/wrapping.
    // Ideally we assume the next one is valid.
    await docRef.update({
        elevenlabs_index: oldIndex + 1
    });
    console.log(`ElevenLabs: Switched key index from ${oldIndex} to ${oldIndex + 1}`);
  } catch (e) {
    console.error("Failed to rotate ElevenLabs key:", e);
  }
};

export const playNarrative = async (text: string, retryCount = 0) => {
  // Prevent infinite loops
  if (retryCount > 2) {
      console.error("ElevenLabs: Max retries reached. Speech failed.");
      notifyListeners(false);
      return;
  }

  stopCurrentNarrative();

  if (!text || text.trim().length === 0) return;

  const cleanText = text.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '').trim();
  if (cleanText.length === 0) return;

  const keyData = await getActiveKeyData();
  
  // If no keys configured, we can't play
  if (!keyData || !keyData.key) {
      console.warn("ElevenLabs: No keys found in settings/api_config");
      notifyListeners(false);
      return;
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`,
      {
        method: "POST",
        headers: {
          "Accept": "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": keyData.key,
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
            style: 0.6,
            use_speaker_boost: true
          }
        }),
      }
    );

    if (!response.ok) {
        // If Unauthorized (401) or Quota Exceeded (429 or sometimes 402), rotate key
        if (response.status === 401 || response.status === 429 || response.status === 402) {
            console.warn(`ElevenLabs Key Failed (Status ${response.status}). Rotating...`);
            await switchToNextKey(keyData.index);
            // Recursively retry
            await playNarrative(text, retryCount + 1);
            return;
        }
        throw new Error(`ElevenLabs API Error: ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    
    currentAudio = new Audio(url);
    
    currentAudio.onplay = () => notifyListeners(true);
    
    currentAudio.play().catch(e => {
        console.error("Audio Play Error:", e);
        notifyListeners(false);
    });
    
    currentAudio.onended = () => {
        notifyListeners(false);
        URL.revokeObjectURL(url);
        currentAudio = null;
    };
    
    currentAudio.onpause = () => {
        if (currentAudio?.ended) return; 
        notifyListeners(false);
    }

  } catch (error) {
    console.error("TTS Error:", error);
    notifyListeners(false);
  }
};
