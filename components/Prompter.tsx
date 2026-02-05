import React, { useEffect, useState, useRef } from 'react';
import { Button } from './Button';
import { 
  ArrowLeft, Play, Pause, Type, Gauge, Timer, Mic, 
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Video, Settings2, Circle, Square, Download, ChevronDown,
  MoveHorizontal, Eye, Aperture, X, Monitor
} from 'lucide-react';

interface PrompterProps {
  script: string;
  onBack: () => void;
}

type TextAlign = 'left' | 'center' | 'right' | 'justify';

interface MediaDevice {
  deviceId: string;
  label: string;
}

const AVAILABLE_FONTS = [
  { name: 'Inter (Default)', value: "'Inter', sans-serif" },
  { name: 'Roboto (Sans)', value: "'Roboto', sans-serif" },
  { name: 'Merriweather (Serif)', value: "'Merriweather', serif" },
  { name: 'Playfair (Display)', value: "'Playfair Display', serif" },
  { name: 'Oswald (Condensed)', value: "'Oswald', sans-serif" },
  { name: 'Mono (Code)', value: "'Roboto Mono', monospace" },
];

export const Prompter: React.FC<PrompterProps> = ({ script, onBack }) => {
  // Configuration State
  const [fontSize, setFontSize] = useState(64);
  const [fontFamily, setFontFamily] = useState(AVAILABLE_FONTS[0].value);
  const [scrollSpeed, setScrollSpeed] = useState(2); 
  const [silenceThresholdSeconds, setSilenceThresholdSeconds] = useState(2);
  const [textAlign, setTextAlign] = useState<TextAlign>('center');
  const [textWidth, setTextWidth] = useState(60); // Percentage width
  const [overlayOpacity, setOverlayOpacity] = useState(0.6); // 0 to 1
  const [vignetteIntensity, setVignetteIntensity] = useState(0); // 0 to 100
  const [showSettings, setShowSettings] = useState(false);
  
  // Runtime State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAutoPaused, setIsAutoPaused] = useState(false);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [micPermission, setMicPermission] = useState<boolean | null>(null);

  // Recording & Media State
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenShareOn, setIsScreenShareOn] = useState(false); // New state for Screen Share
  const [isRecording, setIsRecording] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDevice[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDevice[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const lastNoiseTime = useRef<number>(Date.now());
  const animationFrameRef = useRef<number>();
  const scrollAccumulator = useRef<number>(0);
  
  // Video Refs
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Initialize script paragraphs
  useEffect(() => {
    const paras = script.split('\n').filter(p => p.trim().length > 0);
    setParagraphs(paras.length > 0 ? paras : ["No text provided."]);
  }, [script]);

  // Load Devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        // Request permissions first to get labels
        await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const videos = devices
          .filter(d => d.kind === 'videoinput')
          .map(d => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0,5)}` }));
        
        const audios = devices
          .filter(d => d.kind === 'audioinput')
          .map(d => ({ deviceId: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0,5)}` }));

        setVideoDevices(videos);
        setAudioDevices(audios);
        
        if (videos.length > 0) setSelectedVideoId(videos[0].deviceId);
        if (audios.length > 0) setSelectedAudioId(audios[0].deviceId);
      } catch (err) {
        console.error("Error enumerating devices", err);
      }
    };
    getDevices();
  }, []);

  // --- Background Stream Logic (Camera or Screen) ---

  const stopCurrentStream = () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = null;
      }
  };

  const startCamera = async () => {
      stopCurrentStream();
      try {
        const constraints = {
          video: selectedVideoId ? { deviceId: { exact: selectedVideoId } } : true,
          audio: selectedAudioId ? { deviceId: { exact: selectedAudioId } } : true
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        mediaStreamRef.current = stream;
        if (videoPreviewRef.current) videoPreviewRef.current.srcObject = stream;
        initAudioAnalysisFromStream(stream);
      } catch (err) {
        console.error("Error starting camera:", err);
        setIsCameraOn(false);
      }
  };

  const startScreenShare = async () => {
      stopCurrentStream();
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ 
            video: true, 
            audio: false // Usually we don't need system audio for the prompter functionality
        });
        
        // Handle user clicking "Stop Sharing" on the browser native UI
        stream.getVideoTracks()[0].onended = () => {
            setIsScreenShareOn(false);
            stopCurrentStream();
            initAudioAnalysisOnly(); // Revert to audio only
        };

        mediaStreamRef.current = stream;
        if (videoPreviewRef.current) videoPreviewRef.current.srcObject = stream;
        
        // We still need audio analysis for the "Auto Pause" feature, so we keep the mic running separately
        initAudioAnalysisOnly();

      } catch (err) {
        console.error("Error starting screen share:", err);
        setIsScreenShareOn(false);
      }
  };

  // Effect to handle switching modes
  useEffect(() => {
      if (isCameraOn) {
          startCamera();
      } else if (isScreenShareOn) {
          startScreenShare();
      } else {
          stopCurrentStream();
          // Always keep audio analysis running for silence detection if we aren't using a stream
          initAudioAnalysisOnly();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraOn, isScreenShareOn, selectedVideoId, selectedAudioId]);

  // Toggle Handlers
  const handleToggleCamera = () => {
      if (!isCameraOn) setIsScreenShareOn(false); // Exclusive
      setIsCameraOn(!isCameraOn);
  };

  const handleToggleScreen = () => {
      if (!isScreenShareOn) setIsCameraOn(false); // Exclusive
      setIsScreenShareOn(!isScreenShareOn);
  };

  // --- Audio Logic ---

  const initAudioAnalysisOnly = async () => {
    try {
        if (audioContextRef.current) {
             // Don't close if it's already running and valid, just reuse or reconnect? 
             // Simple approach: close and recreate to switch mics if needed
             audioContextRef.current.close();
        }
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: selectedAudioId ? { deviceId: { exact: selectedAudioId } } : true 
        });
        initAudioAnalysisFromStream(stream);
    } catch (err) {
        console.error("Mic error", err);
        setMicPermission(false);
    }
  };

  const initAudioAnalysisFromStream = (stream: MediaStream) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const analyser = audioCtx.createAnalyser();
      
      // If the stream has audio tracks, use them
      if (stream.getAudioTracks().length > 0) {
          const source = audioCtx.createMediaStreamSource(stream);
          analyser.fftSize = 256;
          source.connect(analyser);
          
          audioContextRef.current = audioCtx;
          analyserRef.current = analyser;
          setMicPermission(true);
          analyzeVolume();
      } else {
          // If stream is video only (screen share), fetch mic separately
          if (isScreenShareOn) initAudioAnalysisOnly();
      }

    } catch (err) {
      console.error("Audio Context Error", err);
    }
  };

  const analyzeVolume = () => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) { sum += dataArray[i]; }
    const average = sum / dataArray.length;
    setCurrentVolume(average);

    if (average > 10) {
      lastNoiseTime.current = Date.now();
      setIsAutoPaused(false);
    } 
    requestAnimationFrame(analyzeVolume);
  };

  // --- Recording Logic ---

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const startRecording = () => {
    if (!mediaStreamRef.current) return;
    
    setRecordedChunks([]);
    setDownloadUrl(null);

    // Try MP4 first, fallback to WebM
    let options = { mimeType: 'video/mp4; codecs=avc1.424028' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/webm;codecs=vp9' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' }; // Generic fallback
      }
    }

    try {
      const recorder = new MediaRecorder(mediaStreamRef.current, options);
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setRecordedChunks((prev) => [...prev, event.data]);
        }
      };

      recorder.onstop = () => {
        // Handled by effect
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording", err);
      alert("Could not start recording. Format might not be supported.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPlaying(false); // Stop text when recording stops
    }
  };

  // Create download URL when recording stops and we have chunks
  useEffect(() => {
    if (!isRecording && recordedChunks.length > 0) {
      const blob = new Blob(recordedChunks, { 
        type: mediaRecorderRef.current?.mimeType || 'video/mp4' 
      });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    }
  }, [isRecording, recordedChunks]);

  // Initial Audio Setup
  useEffect(() => {
    if (!isCameraOn && !isScreenShareOn) {
        initAudioAnalysisOnly();
    }
    return () => {
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  // Keyboard Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      }
      if (e.code === 'ArrowUp') {
        e.preventDefault();
        if (containerRef.current) {
          containerRef.current.scrollTop -= 100;
          updateProgressBar();
        }
      }
      if (e.code === 'ArrowDown') {
        e.preventDefault();
        if (containerRef.current) {
          containerRef.current.scrollTop += 100;
          updateProgressBar();
        }
      }
      if (e.key === '+' || e.code === 'NumpadAdd' || e.key === '=') {
        e.preventDefault();
        setScrollSpeed(prev => Math.min(20, prev + 0.5));
      }
      if (e.key === '-' || e.code === 'NumpadSubtract' || e.key === '_') {
        e.preventDefault();
        setScrollSpeed(prev => Math.max(0, prev - 0.5));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Progress Bar Helper
  const updateProgressBar = () => {
    if (containerRef.current && progressBarRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const maxScroll = scrollHeight - clientHeight;
      const progress = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
      progressBarRef.current.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }
  };

  // Animation Loop
  useEffect(() => {
    const animate = () => {
      if (containerRef.current) {
        updateProgressBar();

        if (isPlaying) {
          const now = Date.now();
          const timeSinceNoise = now - lastNoiseTime.current;
          const silenceLimitMs = silenceThresholdSeconds * 1000;
          const shouldPauseForSilence = micPermission && timeSinceNoise > silenceLimitMs;

          if (shouldPauseForSilence) {
            setIsAutoPaused(true);
          } else {
            setIsAutoPaused(false);
            scrollAccumulator.current += (scrollSpeed * 0.5); 
            if (scrollAccumulator.current >= 1) {
              const pixelsToScroll = Math.floor(scrollAccumulator.current);
              containerRef.current.scrollTop += pixelsToScroll;
              scrollAccumulator.current -= pixelsToScroll;
            }
          }
        }
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, scrollSpeed, silenceThresholdSeconds, micPermission]);

  const isBackgroundActive = isCameraOn || isScreenShareOn;

  return (
    <div className="relative h-screen flex flex-col bg-black overflow-hidden">
      
      {/* --- LAYER 0: Background Camera/Screen Preview --- */}
      <video 
        ref={videoPreviewRef}
        autoPlay 
        muted 
        playsInline
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 pointer-events-none ${isBackgroundActive ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* --- LAYER 1: Vignette Effect --- */}
      {isBackgroundActive && (
          <div 
            className="absolute inset-0 pointer-events-none transition-all duration-300"
            style={{
                background: `radial-gradient(circle, transparent ${100 - vignetteIntensity}%, black 140%)`
            }}
          ></div>
      )}

      {/* --- LAYER 2: Customizable Dark Overlay --- */}
      <div 
        className={`absolute inset-0 bg-black transition-opacity duration-300 pointer-events-none`}
        style={{ opacity: isBackgroundActive ? overlayOpacity : 1 }}
      ></div>

      {/* --- LAYER 3: UI & Text --- */}

      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-50 p-4 flex items-center gap-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-auto">
          <Button variant="secondary" onClick={onBack} icon={<ArrowLeft size={18} />}>
            Back
          </Button>

          <Button 
            variant={isPlaying ? (isAutoPaused ? "danger" : "secondary") : "primary"}
            onClick={() => setIsPlaying(!isPlaying)}
            icon={isPlaying ? <Pause size={18} /> : <Play size={18} />}
            className="w-32 shadow-lg"
          >
            {isPlaying ? (isAutoPaused ? "Waiting..." : "Pause") : "Play"}
          </Button>

          <div className="h-6 w-[1px] bg-white/20 mx-1 hidden md:block"></div>

          <Button 
            variant={isCameraOn ? "primary" : "secondary"}
            onClick={handleToggleCamera}
            icon={<Video size={18} />}
            title="Toggle Webcam"
          >
            {isCameraOn ? "Cam" : "Cam"}
          </Button>

          <Button 
            variant={isScreenShareOn ? "primary" : "secondary"}
            onClick={handleToggleScreen}
            icon={<Monitor size={18} />}
            title="Background Window"
          >
            {isScreenShareOn ? "Window" : "Window"}
          </Button>

          {isBackgroundActive && (
            <Button 
              variant={isRecording ? "danger" : "ghost"}
              className={isRecording ? "animate-pulse border border-red-400 bg-red-900/50" : "text-red-400 hover:bg-red-900/20"}
              onClick={toggleRecording}
              icon={isRecording ? <Square size={18} className="fill-current" /> : <Circle size={18} className="fill-current" />}
            >
              {isRecording ? "REC" : "REC"}
            </Button>
          )}

           {downloadUrl && !isRecording && (
             <a 
               href={downloadUrl} 
               download={`teleprompter-${Date.now()}.mp4`}
               className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-green-900/20"
             >
               <Download size={16} />
               Save
             </a>
          )}

          {/* Settings Button (Toggles Panel) */}
          <button 
             onClick={() => setShowSettings(!showSettings)}
             className={`ml-auto p-2.5 rounded-full transition-all duration-300 ${showSettings ? 'bg-white text-black rotate-90 scale-110' : 'bg-zinc-800 text-white hover:bg-zinc-700'}`}
          >
            {showSettings ? <X size={20} /> : <Settings2 size={20} />}
          </button>
      </div>

      {/* Modern Floating Settings Panel */}
      <div className={`absolute top-20 right-4 w-80 max-h-[85vh] overflow-y-auto bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl transition-all duration-300 transform z-50 ${showSettings ? 'translate-x-0 opacity-100' : 'translate-x-[120%] opacity-0'}`}>
         
         <div className="p-5 space-y-6">
            
            {/* Section: Text Display */}
            <div className="space-y-3">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                    <Type size={12} /> Text Display
                </h3>
                
                <div className="space-y-4 bg-white/5 rounded-xl p-3 border border-white/5">
                     
                     {/* Font Family Selector */}
                     <div className="relative">
                        <select 
                            value={fontFamily}
                            onChange={(e) => setFontFamily(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg py-2 px-3 text-xs text-zinc-300 appearance-none focus:ring-1 focus:ring-blue-500 outline-none"
                            style={{ fontFamily: fontFamily.split(',')[0].replace(/'/g, '') }}
                        >
                            {AVAILABLE_FONTS.map(f => <option key={f.name} value={f.value} className="text-sm">{f.name}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-2.5 text-zinc-500 pointer-events-none" size={12} />
                     </div>

                     {/* Font Size */}
                    <div>
                        <div className="flex justify-between text-xs mb-1.5 text-zinc-300">
                            <span>Size</span> <span>{fontSize}px</span>
                        </div>
                        <input 
                            type="range" min="32" max="140" step="4"
                            value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))}
                            className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>

                    {/* Text Width */}
                    <div>
                        <div className="flex justify-between text-xs mb-1.5 text-zinc-300">
                            <span className="flex items-center gap-1"><MoveHorizontal size={10}/> Width</span> <span>{textWidth}%</span>
                        </div>
                        <input 
                            type="range" min="20" max="100" step="5"
                            value={textWidth} onChange={(e) => setTextWidth(Number(e.target.value))}
                            className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>

                     {/* Alignment */}
                    <div className="flex bg-zinc-900 rounded-lg p-1 gap-1">
                        {(['left', 'center', 'right', 'justify'] as const).map((align) => (
                            <button 
                            key={align}
                            onClick={() => setTextAlign(align)}
                            className={`flex-1 py-1.5 rounded flex justify-center transition-colors ${textAlign === align ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                {align === 'left' && <AlignLeft size={14} />}
                                {align === 'center' && <AlignCenter size={14} />}
                                {align === 'right' && <AlignRight size={14} />}
                                {align === 'justify' && <AlignJustify size={14} />}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Section: Visual Effects */}
            {isBackgroundActive && (
                <div className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-300">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                        <Aperture size={12} /> Visual Effects
                    </h3>
                    <div className="space-y-4 bg-white/5 rounded-xl p-3 border border-white/5">
                        
                        {/* Background Opacity */}
                        <div>
                            <div className="flex justify-between text-xs mb-1.5 text-zinc-300">
                                <span className="flex items-center gap-1"><Eye size={10}/> BG Opacity</span> 
                                <span>{Math.round(overlayOpacity * 100)}%</span>
                            </div>
                            <input 
                                type="range" min="0" max="1" step="0.05"
                                value={overlayOpacity} onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                                className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>

                        {/* Vignette Intensity */}
                        <div>
                            <div className="flex justify-between text-xs mb-1.5 text-zinc-300">
                                <span className="flex items-center gap-1"><Circle size={10}/> Vignette</span> 
                                <span>{vignetteIntensity}%</span>
                            </div>
                            <input 
                                type="range" min="0" max="100" step="5"
                                value={vignetteIntensity} onChange={(e) => setVignetteIntensity(Number(e.target.value))}
                                className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                        </div>

                    </div>
                </div>
            )}

            {/* Section: Teleprompter Logic */}
            <div className="space-y-3">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                    <Gauge size={12} /> Playback
                </h3>
                <div className="space-y-4 bg-white/5 rounded-xl p-3 border border-white/5">
                     {/* Scroll Speed */}
                    <div>
                        <div className="flex justify-between text-xs mb-1.5 text-zinc-300">
                            <span>Scroll Speed</span> <span>{scrollSpeed}</span>
                        </div>
                        <input 
                            type="range" min="0" max="15" step="0.5"
                            value={scrollSpeed} onChange={(e) => setScrollSpeed(Number(e.target.value))}
                            className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-green-500"
                        />
                    </div>

                    {/* Silence Threshold */}
                    <div>
                         <div className="flex justify-between text-xs mb-1.5 text-zinc-300">
                            <span className="flex items-center gap-1"><Mic size={10}/> Auto-Pause</span> 
                            <span>{silenceThresholdSeconds}s</span>
                        </div>
                        <input 
                            type="range" min="1" max="10" step="0.5"
                            value={silenceThresholdSeconds} onChange={(e) => setSilenceThresholdSeconds(Number(e.target.value))}
                            className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-red-400"
                        />
                        {micPermission && (
                            <div className="h-1 w-full bg-zinc-800 mt-2 rounded-full overflow-hidden">
                                <div 
                                className={`h-full transition-all duration-75 ${isAutoPaused ? 'bg-red-500' : 'bg-green-500'}`}
                                style={{ width: `${Math.min(currentVolume * 2, 100)}%` }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Section: Hardware */}
            <div className="space-y-3">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                    <Video size={12} /> Hardware
                </h3>
                <div className="space-y-3 bg-white/5 rounded-xl p-3 border border-white/5">
                     <div className="relative">
                        <select 
                            value={selectedVideoId}
                            onChange={(e) => setSelectedVideoId(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg py-2 px-3 text-xs text-zinc-300 appearance-none focus:ring-1 focus:ring-blue-500 outline-none"
                            disabled={isRecording || isScreenShareOn}
                        >
                            {videoDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-2.5 text-zinc-500 pointer-events-none" size={12} />
                     </div>
                     <div className="relative">
                        <select 
                            value={selectedAudioId}
                            onChange={(e) => setSelectedAudioId(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg py-2 px-3 text-xs text-zinc-300 appearance-none focus:ring-1 focus:ring-blue-500 outline-none"
                            disabled={isRecording}
                        >
                            {audioDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-2.5 text-zinc-500 pointer-events-none" size={12} />
                     </div>
                </div>
            </div>

         </div>
      </div>

      {/* Prompter Text Area */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 md:px-8 py-[45vh] no-scrollbar scroll-smooth z-10"
        onScroll={updateProgressBar}
        style={{
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)'
        }}
      >
        <div 
          className={`mx-auto leading-normal transition-all duration-300 text-${textAlign}`}
          style={{ 
              fontSize: `${fontSize}px`, 
              maxWidth: `${textWidth}%`,
              fontFamily: fontFamily
          }}
        >
          {paragraphs.map((para, idx) => (
            <p key={idx} className="mb-12 text-slate-200 block drop-shadow-lg font-medium tracking-wide">
              {para}
            </p>
          ))}
          <div className="h-[50vh]"></div>
        </div>
      </div>

      {/* Center Line Marker */}
      <div className="absolute top-1/2 left-0 right-0 flex items-center justify-between px-4 pointer-events-none opacity-40 z-20">
        <div className="h-[2px] w-8 bg-red-500 shadow-sm"></div>
        <div className="h-[2px] flex-1 border-t border-dashed border-red-500/80 mx-4"></div>
        <div className="h-[2px] w-8 bg-red-500 shadow-sm"></div>
      </div>

      {/* Status Overlay (Auto-Pause) */}
      {isPlaying && isAutoPaused && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 backdrop-blur text-red-500 px-6 py-3 rounded-xl border border-red-500/30 font-bold flex items-center gap-3 z-40 animate-pulse pointer-events-none">
          <Mic size={24} />
          <span>Listening...</span>
        </div>
      )}

      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-zinc-900/50 z-50">
        <div 
            ref={progressBarRef}
            className={`h-full shadow-[0_0_15px_rgba(37,99,235,0.8)] transition-all duration-75 ease-linear ${isRecording ? 'bg-red-600 shadow-red-500/50' : 'bg-blue-500'}`}
            style={{ width: '0%' }}
        />
      </div>
    </div>
  );
};