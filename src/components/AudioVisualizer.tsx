import React, { useEffect, useRef, useState } from 'react';
import { ConversationState } from '../types';
import { Mic, Volume2, Sparkles, AlertCircle, Play, Camera, Download, Check } from 'lucide-react';

interface AudioVisualizerProps {
  state: ConversationState;
  userVolumeRMS: number;
  userPeakLevel?: number;
  aiVolumeRMS: number;
  aiPeakLevel?: number;
  accentColor?: string;
  isMuted?: boolean;
  onStartSession?: () => void;
  isConnected?: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  state,
  userVolumeRMS,
  userPeakLevel = userVolumeRMS,
  aiVolumeRMS,
  aiPeakLevel = aiVolumeRMS,
  isMuted = false,
  onStartSession,
  isConnected = false,
}) => {
  const [isCaptured, setIsCaptured] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const phaseRef = useRef<number>(0);

  const handleTakeSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      // Create a temporary offscreen canvas with watermark for a polished export
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const eCtx = exportCanvas.getContext('2d');

      if (eCtx) {
        // Draw dark background
        eCtx.fillStyle = '#09090b';
        eCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

        // Draw original waveform canvas
        eCtx.drawImage(canvas, 0, 0);

        // Add brand watermark header/footer
        eCtx.font = 'bold 24px sans-serif';
        eCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        eCtx.fillText('Sonic AI Voice Waveform', 32, 48);

        eCtx.font = '14px monospace';
        eCtx.fillStyle = 'rgba(129, 140, 248, 0.8)';
        const dateStr = new Date().toLocaleString();
        eCtx.fillText(`Captured: ${dateStr} | State: ${state.toUpperCase()}`, 32, 74);
      }

      const dataUrl = exportCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      const timeTag = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      link.download = `sonic-waveform-${timeTag}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setIsCaptured(true);
      setTimeout(() => setIsCaptured(false), 2200);
    } catch (err) {
      console.error('Failed to capture canvas snapshot:', err);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = canvas.offsetWidth * window.devicePixelRatio);
    let height = (canvas.height = canvas.offsetHeight * window.devicePixelRatio);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      height = canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    };

    window.addEventListener('resize', handleResize);

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = Math.min(width, height) * 0.22;

      phaseRef.current += 0.03;
      const p = phaseRef.current;

      // Color scheme selector according to conversation state
      let primaryColor = '129, 140, 248'; // Indigo
      let secondaryColor = '59, 130, 246'; // Blue
      let activeVolume = 0;
      let activePeak = 0;

      if (state === 'listening') {
        primaryColor = '16, 185, 129'; // Emerald
        secondaryColor = '6, 182, 212'; // Cyan
        activeVolume = Math.min(1, userVolumeRMS * 4);
        activePeak = Math.min(1, userPeakLevel * 2.5);
      } else if (state === 'thinking') {
        primaryColor = '168, 85, 247'; // Purple
        secondaryColor = '236, 72, 153'; // Pink
        activeVolume = 0.2 + Math.sin(p * 2) * 0.15;
        activePeak = 0.35 + Math.sin(p * 2.5) * 0.15;
      } else if (state === 'speaking') {
        primaryColor = '59, 130, 246'; // Blue
        secondaryColor = '245, 158, 11'; // Amber
        activeVolume = Math.min(1, aiVolumeRMS * 3.5);
        activePeak = Math.min(1, aiPeakLevel * 2.5);
      } else if (state === 'interrupted') {
        primaryColor = '244, 63, 94'; // Rose
        secondaryColor = '239, 68, 68'; // Red
        activeVolume = 0.6;
        activePeak = 0.8;
      } else {
        // Idle
        activeVolume = 0.05 + Math.sin(p) * 0.03;
        activePeak = 0.08 + Math.sin(p) * 0.04;
      }

      // 1. Draw outer ambient glowing aura (responding to Peak level for quick transients)
      const auraGradient = ctx.createRadialGradient(
        centerX,
        centerY,
        baseRadius * 0.2,
        centerX,
        centerY,
        baseRadius * (1.8 + activePeak * 1.4)
      );
      auraGradient.addColorStop(0, `rgba(${primaryColor}, ${0.25 + activePeak * 0.35})`);
      auraGradient.addColorStop(0.5, `rgba(${secondaryColor}, ${0.1 + activePeak * 0.2})`);
      auraGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * (2.2 + activePeak * 1.4), 0, Math.PI * 2);
      ctx.fillStyle = auraGradient;
      ctx.fill();

      // 2. Draw Peak Meter Ring (shows instantaneous peak spikes as a segmented outer arc)
      const peakRingRadius = baseRadius * 1.45 + activePeak * 25;
      ctx.beginPath();
      ctx.arc(centerX, centerY, peakRingRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.05, activePeak));
      ctx.strokeStyle = `rgba(${primaryColor}, ${0.4 + activePeak * 0.5})`;
      ctx.lineWidth = 4;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]); // Reset line dash

      // 3. Draw pulsing frequency sine waves
      const waveCount = 3;
      for (let w = 0; w < waveCount; w++) {
        ctx.beginPath();
        const points = 80;
        const radiusOffset = (w + 1) * 12 * (1 + activeVolume);
        
        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2;
          const waveAlt = Math.sin(angle * (4 + w) + p * (1 + w * 0.3)) * (10 + activeVolume * 28 + activePeak * 10);
          const r = baseRadius + radiusOffset + waveAlt;
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.closePath();
        ctx.strokeStyle = `rgba(${primaryColor}, ${0.6 - w * 0.15})`;
        ctx.lineWidth = 3 - w * 0.6;
        ctx.stroke();
      }

      // 4. Central Core Glowing Orb
      const coreRadius = baseRadius * (0.85 + activeVolume * 0.35 + Math.sin(p * 1.5) * 0.04);
      const coreGrad = ctx.createRadialGradient(
        centerX - coreRadius * 0.3,
        centerY - coreRadius * 0.3,
        0,
        centerX,
        centerY,
        coreRadius
      );
      coreGrad.addColorStop(0, `rgba(255, 255, 255, 0.95)`);
      coreGrad.addColorStop(0.4, `rgba(${primaryColor}, 0.9)`);
      coreGrad.addColorStop(1, `rgba(${secondaryColor}, 0.8)`);

      ctx.beginPath();
      ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.shadowColor = `rgba(${primaryColor}, 0.6)`;
      ctx.shadowBlur = 25 + activePeak * 35;
      ctx.fill();
      ctx.shadowBlur = 0; // reset shadow

      // 5. Orbiting particles for thinking/active states
      if (state === 'thinking' || state === 'speaking' || state === 'listening') {
        const particleCount = 8;
        for (let i = 0; i < particleCount; i++) {
          const orbitAngle = p * 1.2 + (i * Math.PI * 2) / particleCount;
          const orbitDist = coreRadius + 22 + Math.sin(p * 2 + i) * 8;
          const px = centerX + Math.cos(orbitAngle) * orbitDist;
          const py = centerY + Math.sin(orbitAngle) * orbitDist;

          ctx.beginPath();
          ctx.arc(px, py, 3 + activeVolume * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.7 + Math.sin(p + i) * 0.3})`;
          ctx.fill();
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [state, userVolumeRMS, userPeakLevel, aiVolumeRMS, aiPeakLevel]);

  const getStateBadge = () => {
    switch (state) {
      case 'listening':
        return {
          label: isMuted ? 'Microphone Muted' : 'Listening to your voice...',
          icon: <Mic className="w-4 h-4 text-emerald-400 animate-pulse" />,
          color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        };
      case 'thinking':
        return {
          label: 'Processing conversation turn...',
          icon: <Sparkles className="w-4 h-4 text-purple-400 animate-spin" />,
          color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        };
      case 'speaking':
        return {
          label: 'Sonic is speaking (You can interrupt anytime)',
          icon: <Volume2 className="w-4 h-4 text-blue-400 animate-bounce" />,
          color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        };
      case 'interrupted':
        return {
          label: 'Interrupted! Stopped playback & listening...',
          icon: <AlertCircle className="w-4 h-4 text-rose-400 animate-ping" />,
          color: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        };
      default:
        return {
          label: isConnected ? 'Ready — Speak naturally into mic' : 'Click "Start Conversation" to begin',
          icon: <Mic className="w-4 h-4 text-indigo-400" />,
          color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        };
    }
  };

  const badge = getStateBadge();

  return (
    <div className="relative w-full h-[280px] sm:h-[340px] flex flex-col items-center justify-center rounded-3xl bg-gradient-to-b from-zinc-900/90 via-zinc-950 to-zinc-950 border border-zinc-800/80 shadow-2xl overflow-hidden p-4 group">
      {/* Subtle Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293715_1px,transparent_1px),linear-gradient(to_bottom,#1f293715_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      {/* Main Canvas Visualizer */}
      <canvas ref={canvasRef} className="w-full h-full relative z-10 cursor-pointer" />

      {/* Top Right Snapshot Capture Button */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={handleTakeSnapshot}
          title="Capture and download PNG snapshot of current waveform"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-md text-[11px] font-medium text-zinc-300 hover:text-white hover:bg-zinc-800/90 active:scale-95 transition-all shadow-md group/snap"
        >
          {isCaptured ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-semibold">Snapshot Saved!</span>
            </>
          ) : (
            <>
              <Camera className="w-3.5 h-3.5 text-indigo-400 group-hover/snap:scale-110 transition-transform" />
              <span className="hidden sm:inline">Snapshot Waveform</span>
              <Download className="w-3 h-3 text-zinc-500 sm:hidden" />
            </>
          )}
        </button>
      </div>
      {isConnected && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-md text-[11px] font-mono text-zinc-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-zinc-300 font-semibold">
              {state === 'speaking' ? 'AI Audio' : 'Mic Input'}
            </span>
          </div>
          <span className="text-zinc-600">|</span>
          <span className="text-indigo-300">
            RMS: {Math.round((state === 'speaking' ? aiVolumeRMS : userVolumeRMS) * 100)}%
          </span>
          <span className="text-zinc-600">•</span>
          <span className="text-emerald-300 font-bold">
            PEAK: {Math.round((state === 'speaking' ? aiPeakLevel : userPeakLevel) * 100)}%
          </span>
        </div>
      )}

      {/* Center Overlay if not connected */}
      {!isConnected && onStartSession && (
        <div className="absolute z-20 flex flex-col items-center gap-3">
          <button
            onClick={onStartSession}
            className="group/btn relative flex items-center gap-2.5 px-6 py-3.5 rounded-full bg-gradient-to-r from-indigo-500 via-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-105 active:scale-95 transition-all duration-200"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Start Conversation</span>
          </button>
        </div>
      )}

      {/* Bottom Status Pill */}
      <div className="absolute bottom-4 z-20 flex items-center justify-center">
        <div
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-medium border backdrop-blur-md shadow-lg transition-all duration-300 ${badge.color}`}
        >
          {badge.icon}
          <span>{badge.label}</span>
        </div>
      </div>
    </div>
  );
};
