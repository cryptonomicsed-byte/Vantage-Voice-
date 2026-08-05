import React, { useMemo } from 'react';
import * as d3 from 'd3';
import { LatencyMetrics } from '../types';
import { Zap, Activity, ArrowUpRight, ArrowDownLeft, TrendingUp } from 'lucide-react';

interface LatencyStatsProps {
  metrics: LatencyMetrics;
}

export const LatencyStats: React.FC<LatencyStatsProps> = ({ metrics }) => {
  const history = metrics.latencyHistory || [];

  // Generate D3 SVG paths for line and area fill
  const { linePath, areaPath, lastPoint, minVal, maxVal } = useMemo(() => {
    if (!history || history.length === 0) {
      return { linePath: '', areaPath: '', lastPoint: null, minVal: 0, maxVal: 0 };
    }

    const width = 120;
    const height = 32;
    const padding = 4;

    const data = history.slice(-10); // Last 10 exchanges
    const minVal = Math.min(...data);
    const maxVal = Math.max(...data);

    const xScale = d3
      .scaleLinear()
      .domain([0, Math.max(1, data.length - 1)])
      .range([padding, width - padding]);

    const yScale = d3
      .scaleLinear()
      .domain([Math.max(0, minVal * 0.8), maxVal * 1.2 || 100])
      .range([height - padding, padding]);

    const lineGenerator = d3
      .line<number>()
      .x((_, i) => xScale(i))
      .y((d) => yScale(d))
      .curve(d3.curveMonotoneX);

    const areaGenerator = d3
      .area<number>()
      .x((_, i) => xScale(i))
      .y0(height)
      .y1((d) => yScale(d))
      .curve(d3.curveMonotoneX);

    const linePath = lineGenerator(data) || '';
    const areaPath = areaGenerator(data) || '';

    const lastX = xScale(data.length - 1);
    const lastY = yScale(data[data.length - 1]);

    return {
      linePath,
      areaPath,
      lastPoint: { x: lastX, y: lastY, value: data[data.length - 1] },
      minVal,
      maxVal,
    };
  }, [history]);

  return (
    <div className="w-full bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3.5 backdrop-blur-md space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Time to First Audio</p>
            <p className="text-xs sm:text-sm font-mono font-bold text-zinc-100">
              {metrics.timeToFirstAudioMs ? `${metrics.timeToFirstAudioMs} ms` : '—'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Roundtrip Latency</p>
            <p className="text-xs sm:text-sm font-mono font-bold text-zinc-100">
              {metrics.roundTripLatencyMs ? `${metrics.roundTripLatencyMs} ms` : '—'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ArrowUpRight className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Audio Sent</p>
            <p className="text-xs sm:text-sm font-mono font-bold text-zinc-100">
              {metrics.packetsSent} chunks
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <ArrowDownLeft className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Audio Received</p>
            <p className="text-xs sm:text-sm font-mono font-bold text-zinc-100">
              {metrics.packetsReceived} chunks
            </p>
          </div>
        </div>
      </div>

      {/* D3 Latency Sparkline Graph */}
      {history.length > 0 && (
        <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[11px] font-medium text-zinc-400">
              Latency History (Last {Math.min(10, history.length)} exchanges)
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-[10px] font-mono text-zinc-500 hidden sm:block">
              min: <span className="text-zinc-300">{minVal}ms</span> | max:{' '}
              <span className="text-zinc-300">{maxVal}ms</span>
            </div>

            {/* D3 SVG Sparkline */}
            <div className="relative w-[120px] h-[32px]">
              <svg className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {areaPath && <path d={areaPath} fill="url(#latencyGrad)" />}
                {linePath && (
                  <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
                )}
                {lastPoint && (
                  <>
                    <circle cx={lastPoint.x} cy={lastPoint.y} r="3" fill="#818cf8" />
                    <circle
                      cx={lastPoint.x}
                      cy={lastPoint.y}
                      r="6"
                      fill="#818cf8"
                      opacity="0.3"
                      className="animate-ping"
                    />
                  </>
                )}
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
