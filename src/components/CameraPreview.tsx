import React, { useEffect, useRef, useState } from 'react';
import { Camera, Monitor, X, Eye } from 'lucide-react';

interface CameraPreviewProps {
  onFrameCaptured: (base64Data: string, mimeType: string) => void;
  isEnabled: boolean;
  onClose: () => void;
}

export const CameraPreview: React.FC<CameraPreviewProps> = ({
  onFrameCaptured,
  isEnabled,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [streamType, setStreamType] = useState<'camera' | 'screen'>('camera');
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isEnabled) {
      stopStream();
      return;
    }

    startStream(streamType);

    return () => {
      stopStream();
    };
  }, [isEnabled, streamType]);

  const stopStream = () => {
    if (activeStream) {
      activeStream.getTracks().forEach((track) => track.stop());
      setActiveStream(null);
    }
  };

  const startStream = async (type: 'camera' | 'screen') => {
    stopStream();
    setErrorMsg(null);
    try {
      let stream: MediaStream;
      if (type === 'camera') {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 15 } },
        });
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { max: 15 } },
        });
      }

      setActiveStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.error('Failed to start video stream:', err);
      setErrorMsg(err?.message || 'Permission denied or stream unavailable');
    }
  };

  // Capture frame at 1 FPS and send to parent
  useEffect(() => {
    if (!activeStream || !isEnabled) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== 4) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = 640;
      canvas.height = 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      const base64Data = dataUrl.split(',')[1];
      if (base64Data) {
        onFrameCaptured(base64Data, 'image/jpeg');
      }
    }, 1000); // 1 FPS

    return () => clearInterval(interval);
  }, [activeStream, isEnabled, onFrameCaptured]);

  if (!isEnabled) return null;

  return (
    <div className="relative w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl overflow-hidden p-3">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
          <Eye className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span>Multimodal Vision Input (1 FPS)</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setStreamType('camera')}
            className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
              streamType === 'camera'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
            title="Camera Stream"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setStreamType('screen')}
            className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
              streamType === 'screen'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
            title="Share Screen"
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {errorMsg ? (
        <div className="p-4 text-center text-xs text-rose-400 bg-rose-500/10 rounded-xl">
          {errorMsg}
        </div>
      ) : (
        <div className="relative aspect-video rounded-xl bg-black overflow-hidden border border-zinc-800">
          <video
            ref={videoRef}
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-[10px] text-emerald-400 border border-emerald-500/20">
            Streaming frame to Gemini
          </span>
        </div>
      )}
    </div>
  );
};
