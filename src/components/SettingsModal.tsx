import React, { useState } from 'react';
import { AppSettings, VoiceName, AgentFramework } from '../types';
import { AVAILABLE_VOICES, SYSTEM_PERSONAS, TRANSLATION_LANGUAGES } from '../lib/constants';
import { X, Sparkles, Volume2, Sliders, Globe, Wrench, Shield, Check, Mic, Bot, Terminal, FileText, Cpu, Brain } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>({ ...settings });
  const [activeTab, setActiveTab] = useState<'persona' | 'voice' | 'agent' | 'translation' | 'audio'>('persona');

  if (!isOpen) return null;

  const handlePersonaSelect = (personaId: string) => {
    const selected = SYSTEM_PERSONAS.find((p) => p.id === personaId);
    if (selected) {
      setLocalSettings((prev) => ({
        ...prev,
        personaId,
        voice: selected.defaultVoice,
        customInstruction: '',
      }));
    } else {
      setLocalSettings((prev) => ({ ...prev, personaId }));
    }
  };

  const handleSave = () => {
    onSaveSettings(localSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Speech-to-Speech Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 px-5 gap-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('persona')}
            className={`py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'persona'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            System Persona
          </button>
          <button
            onClick={() => setActiveTab('voice')}
            className={`py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'voice'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Volume2 className="w-4 h-4" />
            AI Voice
          </button>
          <button
            onClick={() => setActiveTab('agent')}
            className={`py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'agent'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Bot className="w-4 h-4 text-emerald-500" />
            Agent & Tools
          </button>
          <button
            onClick={() => setActiveTab('translation')}
            className={`py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'translation'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Globe className="w-4 h-4" />
            Live Translation
          </button>
          <button
            onClick={() => setActiveTab('audio')}
            className={`py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'audio'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Mic className="w-4 h-4" />
            VAD & Audio
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
          {/* TAB 1: Persona */}
          {activeTab === 'persona' && (
            <div className="space-y-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Choose a pre-configured AI persona or enter a custom prompt instructions.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SYSTEM_PERSONAS.map((p) => {
                  const isSelected = localSettings.personaId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handlePersonaSelect(p.id)}
                      className={`text-left p-3.5 rounded-2xl border transition-all ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-500/10 text-zinc-900 dark:text-zinc-100 shadow-sm'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs sm:text-sm">{p.name}</span>
                        {isSelected && <Check className="w-4 h-4 text-indigo-500" />}
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                        {p.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Custom Prompt Box */}
              <div className="pt-2">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Custom System Instructions
                </label>
                <textarea
                  value={localSettings.customInstruction}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      customInstruction: e.target.value,
                      personaId: 'custom',
                    }))
                  }
                  placeholder="e.g. You are a helpful English teacher, speak slowly and gently correct my grammar."
                  rows={3}
                  className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-3 text-xs sm:text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {/* TAB 2: AI Voice */}
          {activeTab === 'voice' && (
            <div className="space-y-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Select your preferred Gemini prebuilt AI voice for speech generation.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {AVAILABLE_VOICES.map((v) => {
                  const isSelected = localSettings.voice === v.name;
                  return (
                    <button
                      key={v.name}
                      onClick={() =>
                        setLocalSettings((prev) => ({ ...prev, voice: v.name }))
                      }
                      className={`text-left p-3.5 rounded-2xl border transition-all ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-500/10 text-zinc-900 dark:text-zinc-100 shadow-sm'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{v.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
                          {v.gender}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{v.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: Agent Framework & Tools */}
          {activeTab === 'agent' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 mb-1">
                  <Bot className="w-4 h-4 text-emerald-500" />
                  Agent Framework Integration
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                  Select an agent framework architecture to drive real-time tool calling and reasoning logic.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      id: 'native' as AgentFramework,
                      title: 'Native Gemini Live S2S',
                      desc: 'Direct, low-latency function calling built into the Gemini Live API session.',
                      icon: Cpu,
                      color: 'text-indigo-500',
                    },
                    {
                      id: 'hermes' as AgentFramework,
                      title: 'Hermes (Nous Research)',
                      desc: 'Autonomous reasoning engine with structured scratchpads & tool invocation loops.',
                      icon: Brain,
                      color: 'text-emerald-500',
                    },
                    {
                      id: 'open_claw' as AgentFramework,
                      title: 'Open Claw Web Crawler',
                      desc: 'Autonomous web extraction & document clawing for real-time deep web synthesis.',
                      icon: Terminal,
                      color: 'text-amber-500',
                    },
                    {
                      id: 'langchain_react' as AgentFramework,
                      title: 'ReAct Agent Loop',
                      desc: 'Standard Thought-Action-Observation multi-step reasoning cycle.',
                      icon: Wrench,
                      color: 'text-cyan-500',
                    },
                  ].map((fw) => {
                    const isSelected = localSettings.agentFramework === fw.id;
                    const IconComp = fw.icon;
                    return (
                      <button
                        key={fw.id}
                        onClick={() =>
                          setLocalSettings((prev) => ({ ...prev, agentFramework: fw.id }))
                        }
                        className={`text-left p-3.5 rounded-2xl border transition-all ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-500/10 text-zinc-900 dark:text-zinc-100 shadow-sm'
                            : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-xs sm:text-sm flex items-center gap-1.5">
                            <IconComp className={`w-4 h-4 ${fw.color}`} />
                            {fw.title}
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-indigo-500" />}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{fw.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tool Capabilities Toggles */}
              <div className="pt-2 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Tool Capabilities & Automation
                </h4>

                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
                  <div>
                    <h5 className="text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      Enable Live Function Tools
                    </h5>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Allows AI to trigger weather, time, web search, and calculation tools in real time.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.enableTools}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({ ...prev, enableTools: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
                  <div>
                    <h5 className="text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      Code Interpreter Scratchpad
                    </h5>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Equips agent with executable code scratchpad for complex math & logic (`run_code_interpreter`).
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.enableCodeInterpreter}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({ ...prev, enableCodeInterpreter: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
                  <div>
                    <h5 className="text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      Open Claw Deep Web Extraction
                    </h5>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Enables autonomous web page clawing and document parsing tool (`execute_claw_agent`).
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.enableClawCrawler}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({ ...prev, enableClawCrawler: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
                  <div>
                    <h5 className="text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-500" />
                      Auto-Generate Session Summary on Stop
                    </h5>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Automatically opens the AI Session Intelligence summary modal whenever you stop a voice session.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.autoSummarizeOnStop}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({ ...prev, autoSummarizeOnStop: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
          {activeTab === 'translation' && (
            <div className="space-y-4">
              {/* Auto-Detect Spoken Language Toggle */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-indigo-500" />
                    Auto-Detect Spoken Language
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Uses client-side LanguageDetect to identify user's spoken language in real time and automatically synchronize session settings.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.autoDetectLanguage}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, autoDetectLanguage: e.target.checked }))
                  }
                  className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Live Speech-to-Speech Translation Mode
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Uses Gemini 3.5 Live Translate to translate spoken dialogue into a target language in real time.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.translationMode}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, translationMode: e.target.checked }))
                  }
                  className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                />
              </div>

              {localSettings.translationMode && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                    Target Language
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {TRANSLATION_LANGUAGES.map((lang) => {
                      const isSel = localSettings.targetLanguageCode === lang.code;
                      return (
                        <button
                          key={lang.code}
                          onClick={() =>
                            setLocalSettings((prev) => ({
                              ...prev,
                              targetLanguageCode: lang.code,
                              targetLanguage: lang.name.split(' ')[0],
                            }))
                          }
                          className={`p-2.5 rounded-xl border text-xs text-left transition-all ${
                            isSel
                              ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold'
                              : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                          }`}
                        >
                          {lang.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Function Tools Toggle */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 mt-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Wrench className="w-4 h-4 text-amber-500" />
                    Function Calling Tools
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Allow Sonic AI to look up live weather, check current time, search web facts, or do math calculations.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.enableTools}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, enableTools: e.target.checked }))
                  }
                  className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* TAB 4: VAD & Audio */}
          {activeTab === 'audio' && (
            <div className="space-y-5">
              <div>
                <div className="flex justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  <span>AI Speech Playback Speed (Rate)</span>
                  <span className="font-mono text-indigo-500">{localSettings.playbackSpeed.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.75"
                  max="1.75"
                  step="0.05"
                  value={localSettings.playbackSpeed}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      playbackSpeed: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <p className="text-[11px] text-zinc-400 mt-1">
                  Adjust the voice playback speed multiplier for AI speech output (0.75x slow to 1.75x fast).
                </p>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  <span>Voice Activity Detection (VAD) Sensitivity</span>
                  <span>{Math.round(localSettings.vadSensitivity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.005"
                  max="0.08"
                  step="0.005"
                  value={localSettings.vadSensitivity}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      vadSensitivity: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <p className="text-[11px] text-zinc-400 mt-1">
                  Lower threshold makes microphone more sensitive to quiet voices. Higher threshold suppresses background noise.
                </p>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  <span>Silence Timeout Before Ending Turn</span>
                  <span>{localSettings.silenceTimeoutMs} ms</span>
                </div>
                <input
                  type="range"
                  min="600"
                  max="3000"
                  step="200"
                  value={localSettings.silenceTimeoutMs}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      silenceTimeoutMs: parseInt(e.target.value),
                    }))
                  }
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-emerald-500" />
                    Web Audio DSP Noise Suppression
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Filters out low-frequency AC/HVAC hum (&lt;90Hz) and high-frequency fan sizzle (&gt;3.8kHz) before sending audio.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.enableNoiseSuppression}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      enableNoiseSuppression: e.target.checked,
                    }))
                  }
                  className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    Voice Isolation Noise Gate
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Attenuates ambient background noise by 95% when you are not speaking, ensuring background sounds are muted.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.enableVoiceIsolationGate}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      enableVoiceIsolationGate: e.target.checked,
                    }))
                  }
                  className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Barge-in / Interruptions
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Automatically stop AI speech output whenever user starts speaking into microphone.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.enableBargeIn}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, enableBargeIn: e.target.checked }))
                  }
                  className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-3 bg-zinc-50 dark:bg-zinc-950/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20 transition-all"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
