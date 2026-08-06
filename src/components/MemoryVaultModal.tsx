import React, { useState, useRef, useMemo } from 'react';
import { MemoryItem, MemoryTier } from '../types';
import {
  ShieldCheck,
  Lock,
  User,
  Database,
  Search,
  Plus,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  Copy,
  Check,
  X,
  Sparkles,
  Tag,
  Download,
  Upload,
  AlertCircle,
  FolderOpen,
  CheckCircle2,
  TrendingUp,
  GitMerge,
  AlertTriangle,
  BarChart3,
  ArrowUpDown,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';

interface MemoryVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  memories: MemoryItem[];
  onAddMemory: (memory: Omit<MemoryItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateMemory: (id: string, updates: Partial<MemoryItem>) => void;
  onDeleteMemory: (id: string) => void;
  onClearAllMemories: () => void;
  onImportMemories: (memories: MemoryItem[]) => void;
}

// String similarity metric for smart collision detection
const getSimilarity = (s1: string, s2: string): number => {
  const str1 = s1.toLowerCase().trim();
  const str2 = s2.toLowerCase().trim();
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0;
  if (str1.includes(str2) || str2.includes(str1)) return 0.85;

  const getBigrams = (str: string) => {
    const s = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      s.add(str.slice(i, i + 2));
    }
    return s;
  };

  const bg1 = getBigrams(str1);
  const bg2 = getBigrams(str2);
  let intersection = 0;
  bg1.forEach((b) => {
    if (bg2.has(b)) intersection++;
  });
  const union = bg1.size + bg2.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

// Chronological chart data generation for Recharts
const prepareChartData = (items: MemoryItem[]) => {
  if (items.length === 0) return [];
  const sorted = [...items].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let cumulativeSecure = 0;
  let cumulativePersonal = 0;
  let cumulativeRegular = 0;

  return sorted.map((item, idx) => {
    if (item.tier === 'secure') cumulativeSecure++;
    else if (item.tier === 'personal') cumulativePersonal++;
    else cumulativeRegular++;

    const d = new Date(item.createdAt);
    const timeLabel = isNaN(d.getTime())
      ? `#${idx + 1}`
      : `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

    return {
      name: timeLabel,
      key: item.key,
      Secure: cumulativeSecure,
      Personal: cumulativePersonal,
      Regular: cumulativeRegular,
      Total: idx + 1,
    };
  });
};


// Helper for Auto-tagging memories based on content keywords
const generateAutoTags = (key: string, value: string, category: string, tier: MemoryTier): string[] => {
  const combined = `${key} ${value} ${category}`.toLowerCase();
  const tags = new Set<string>();

  if (category && category.trim().length > 1) {
    tags.add(category.trim().toLowerCase());
  }

  tags.add(tier);

  // Keyword rule patterns
  const patterns: [RegExp, string][] = [
    [/auth|token|secret|password|key|vault|passcode|cert/i, 'auth'],
    [/security|encrypt|private|confidential/i, 'security'],
    [/user|name|profile|identity|avatar/i, 'identity'],
    [/email|phone|contact|address/i, 'contact'],
    [/language|translate|spanish|english|french|german/i, 'language'],
    [/goal|target|objective|milestone/i, 'goals'],
    [/system|agent|architecture|config|prompt|model/i, 'system'],
    [/preference|settings|theme|option/i, 'preference'],
    [/project|task|repo|code|dev/i, 'development'],
  ];

  patterns.forEach(([regex, tag]) => {
    if (regex.test(combined)) tags.add(tag);
  });

  // Extract meaningful capital words or nouns from key
  const words = key
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())
    .filter((w) => w.length >= 4 && !['user', 'memory', 'agent', 'primary', 'target', 'core'].includes(w));

  words.slice(0, 2).forEach((w) => tags.add(w));

  return Array.from(tags);
};

export const MemoryVaultModal: React.FC<MemoryVaultModalProps> = ({
  isOpen,
  onClose,
  memories,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
  onClearAllMemories,
  onImportMemories,
}) => {
  const [selectedTier, setSelectedTier] = useState<MemoryTier | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'alphabetical' | 'tier'>('recent');
  const [showAddForm, setShowAddForm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [unmaskedMap, setUnmaskedMap] = useState<Record<string, boolean>>({});
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Add Form State
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newCategory, setNewCategory] = useState('General');
  const [newTier, setNewTier] = useState<MemoryTier>('regular');
  const [newTags, setNewTags] = useState('');

  // Editing Item State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showChart, setShowChart] = useState(false);

  const collisionMatch =
    newKey.trim().length >= 2
      ? memories.find((m) => getSimilarity(newKey, m.key) >= 0.6)
      : undefined;

  const filteredMemories = memories.filter((m) => {
    const matchesTier = selectedTier === 'all' || m.tier === selectedTier;
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      m.key.toLowerCase().includes(q) ||
      m.value.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q) ||
      m.tier.toLowerCase().includes(q) ||
      (m.tags && m.tags.some((t) => t.toLowerCase().includes(q)));
    return matchesTier && matchesQuery;
  });

  const sortedMemories = useMemo(() => {
    return [...filteredMemories].sort((a, b) => {
      if (sortBy === 'recent') {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      }
      if (sortBy === 'alphabetical') {
        return a.key.localeCompare(b.key, undefined, { sensitivity: 'base' });
      }
      if (sortBy === 'tier') {
        const tierOrder: Record<MemoryTier, number> = { secure: 0, personal: 1, regular: 2 };
        const rankA = tierOrder[a.tier] ?? 3;
        const rankB = tierOrder[b.tier] ?? 3;
        if (rankA !== rankB) return rankA - rankB;
        return a.key.localeCompare(b.key);
      }
      return 0;
    });
  }, [filteredMemories, sortBy]);

  if (!isOpen) return null;

  const countByTier = {
    all: memories.length,
    secure: memories.filter((m) => m.tier === 'secure').length,
    personal: memories.filter((m) => m.tier === 'personal').length,
    regular: memories.filter((m) => m.tier === 'regular').length,
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleMask = (id: string) => {
    setUnmaskedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;

    let parsedTags = newTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    // Auto-generate tags if user left tags field empty
    if (parsedTags.length === 0) {
      parsedTags = generateAutoTags(newKey, newValue, newCategory, newTier);
    }

    onAddMemory({
      key: newKey.trim(),
      value: newValue.trim(),
      category: newCategory.trim() || 'General',
      tier: newTier,
      tags: parsedTags,
    });

    setNewKey('');
    setNewValue('');
    setNewCategory('General');
    setNewTags('');
    setShowAddForm(false);
  };

  const handleAutoTagGenerate = () => {
    const suggested = generateAutoTags(newKey, newValue, newCategory, newTier);
    if (suggested.length > 0) {
      const existing = newTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const combined = Array.from(new Set([...existing, ...suggested]));
      setNewTags(combined.join(', '));
    }
  };

  const handleSaveEdit = (id: string) => {
    if (!editValue.trim()) return;
    onUpdateMemory(id, { value: editValue.trim(), updatedAt: new Date().toISOString() });
    setEditingId(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllVisible = () => {
    const visibleIds = filteredMemories.map((m) => m.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    selectedIds.forEach((id) => onDeleteMemory(id));
    setSelectedIds([]);
  };

  const handleExportSelectedJSON = () => {
    if (selectedIds.length === 0) return;
    const itemsToExport = memories.filter((m) => selectedIds.includes(m.id));
    const blob = new Blob([JSON.stringify(itemsToExport, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memory-vault-selected-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(memories, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memory-vault-backup-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        let itemsToImport: MemoryItem[] = [];
        if (Array.isArray(parsed)) {
          itemsToImport = parsed;
        } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.memories)) {
          itemsToImport = parsed.memories;
        } else {
          throw new Error('Invalid JSON format');
        }

        const validItems: MemoryItem[] = itemsToImport.map((item, index) => ({
          id: item.id || `imported-${Date.now()}-${index}`,
          key: item.key || 'Untitled Memory',
          value: item.value || '',
          category: item.category || 'General',
          tier: (['secure', 'personal', 'regular'].includes(item.tier) ? item.tier : 'regular') as MemoryTier,
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString(),
          tags: Array.isArray(item.tags) ? item.tags : [],
        }));

        if (validItems.length > 0) {
          onImportMemories(validItems);
          setImportStatus(`Successfully restored ${validItems.length} items to vault!`);
          setTimeout(() => setImportStatus(null), 3500);
        } else {
          setImportStatus('No valid memory items found in JSON.');
          setTimeout(() => setImportStatus(null), 3500);
        }
      } catch (err) {
        setImportStatus('Failed to parse JSON backup file.');
        setTimeout(() => setImportStatus(null), 3500);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const getTierBadge = (tier: MemoryTier) => {
    switch (tier) {
      case 'secure':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 shadow-sm">
            <Lock className="w-3 h-3 text-red-500" />
            Top Secure
          </span>
        );
      case 'personal':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-sm">
            <User className="w-3 h-3 text-amber-500" />
            Personal Info
          </span>
        );
      case 'regular':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 shadow-sm">
            <Database className="w-3 h-3 text-indigo-500" />
            Regular Context
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                Agent Memory Vault
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-mono font-medium">
                  Multi-Tiered
                </span>
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Layered memory architecture accessible by the AI agent during voice conversations.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowChart(!showChart)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                showChart
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline">Growth Chart</span>
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Memory</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Recharts Vault Growth Chart Drawer */}
        {showChart && (
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-950 text-white space-y-2 transition-all">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                <TrendingUp className="w-4 h-4 text-indigo-400" />
                Memory Vault Tier Growth Timeline (Recharts)
              </h4>
              <span className="text-[10px] text-zinc-400 font-mono">{memories.length} Total Memory Items</span>
            </div>
            <div className="h-44 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={prepareChartData(memories)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="name" stroke="#71717a" fontSize={10} />
                  <YAxis stroke="#71717a" fontSize={10} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      borderColor: '#3f3f46',
                      borderRadius: '12px',
                      fontSize: '11px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line type="monotone" dataKey="Secure" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Personal" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Regular" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Total" stroke="#10b981" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Add Memory Drawer */}
        {showAddForm && (
          <form
            onSubmit={handleAddSubmit}
            className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3 transition-all"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Store New Memory Key
              </h4>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                Cancel
              </button>
            </div>

            {/* Smart Collision Alert */}
            {collisionMatch && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-xs animate-fadeIn">
                <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 font-bold">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Smart Collision Alert: Similar Memory Key Exists!
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20">
                    Existing: "{collisionMatch.key}"
                  </span>
                </div>
                <p className="text-zinc-700 dark:text-zinc-300">
                  Current Value: <span className="font-semibold">{collisionMatch.value}</span> ({collisionMatch.tier})
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateMemory(collisionMatch.id, {
                        value: newValue || collisionMatch.value,
                        category: newCategory || collisionMatch.category,
                        tier: newTier || collisionMatch.tier,
                        updatedAt: new Date().toISOString(),
                      });
                      setNewKey('');
                      setNewValue('');
                      setShowAddForm(false);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    <span>Merge / Update Existing Memory</span>
                  </button>
                </div>
              </div>
            )}


            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                  Memory Tier Level
                </label>
                <select
                  value={newTier}
                  onChange={(e) => setNewTier(e.target.value as MemoryTier)}
                  className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="regular">📁 Regular Low-Level Context</option>
                  <option value="personal">👤 Tier 2: Personal Identity & Info</option>
                  <option value="secure">🔐 Tier 1: Top High-Security Vault</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                  Memory Key / Title
                </label>
                <input
                  type="text"
                  placeholder="e.g., User Preferred Name, API Token"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  placeholder="e.g., Identity, Auth, Notes"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                Memory Value Content
              </label>
              <textarea
                rows={2}
                placeholder="Content details to remember..."
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  placeholder="Tags (comma separated, e.g. pref, contact, secure)"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200"
                />
                <button
                  type="button"
                  onClick={handleAutoTagGenerate}
                  title="Automatically suggest tags based on key and content"
                  className="px-2.5 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Auto-Tag</span>
                </button>
              </div>

              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm active:scale-95 transition-all shrink-0"
              >
                Save Memory Item
              </button>
            </div>
          </form>
        )}

        {/* Import Status Toast Banner */}
        {importStatus && (
          <div className="px-6 py-2 bg-emerald-500/15 dark:bg-emerald-950/40 border-b border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between transition-all">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {importStatus}
            </span>
            <button
              onClick={() => setImportStatus(null)}
              className="text-xs opacity-70 hover:opacity-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tier Tabs & Search Row */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Tier Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            <button
              onClick={() => setSelectedTier('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                selectedTier === 'all'
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
              }`}
            >
              <span>All Levels</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-700/20 dark:bg-zinc-300/20">
                {countByTier.all}
              </span>
            </button>

            <button
              onClick={() => setSelectedTier('secure')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                selectedTier === 'secure'
                  ? 'bg-red-500 text-white shadow-sm'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>🔐 Top Secure</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-500/20">
                {countByTier.secure}
              </span>
            </button>

            <button
              onClick={() => setSelectedTier('personal')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                selectedTier === 'personal'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>👤 Personal Info</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20">
                {countByTier.personal}
              </span>
            </button>

            <button
              onClick={() => setSelectedTier('regular')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                selectedTier === 'regular'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>📁 Regular Context</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500/20">
                {countByTier.regular}
              </span>
            </button>
          </div>

          {/* Search Bar & Sort Dropdown */}
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            {/* Search Bar */}
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search keyword, category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 rounded-xl text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="relative shrink-0">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'recent' | 'alphabetical' | 'tier')}
                className="pl-8 pr-3 py-1.5 rounded-xl text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer font-semibold appearance-none"
                title="Sort memories"
              >
                <option value="recent">Recently Updated</option>
                <option value="alphabetical">Alphabetical (A-Z)</option>
                <option value="tier">By Tier</option>
              </select>
              <ArrowUpDown className="w-3.5 h-3.5 text-indigo-500 absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Multi-Select Action Bar */}
        <div className="px-6 py-2.5 bg-indigo-50/80 dark:bg-indigo-950/40 border-b border-indigo-200 dark:border-indigo-800/60 flex items-center justify-between text-xs transition-all">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={
                  filteredMemories.length > 0 &&
                  filteredMemories.every((m) => selectedIds.includes(m.id))
                }
                onChange={handleSelectAllVisible}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
              />
              <span>Select All Visible ({filteredMemories.length})</span>
            </label>

            {selectedIds.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 font-bold font-mono text-[11px]">
                {selectedIds.length} selected
              </span>
            )}
          </div>

          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportSelectedJSON}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-sm active:scale-95"
                title="Export selected memories to JSON"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export ({selectedIds.length})</span>
              </button>

              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold transition-all shadow-sm active:scale-95"
                title="Delete selected memories"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete ({selectedIds.length})</span>
              </button>

              <button
                onClick={() => setSelectedIds([])}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                title="Clear selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Hidden File Input for JSON Restore */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".json"
          className="hidden"
        />

        {/* Memories List Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
          {sortedMemories.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center text-zinc-400 space-y-2">
              <FolderOpen className="w-10 h-10 opacity-30 text-indigo-500" />
              <p className="text-sm font-medium text-zinc-300">No memory items found matching filter</p>
              <p className="text-xs text-zinc-500 max-w-xs">
                Add memories manually, import a JSON backup, or ask the Sonic AI voice agent to remember key information during conversation.
              </p>
            </div>
          ) : (
            sortedMemories.map((mem) => {
              const isEditing = editingId === mem.id;
              const isUnmasked = !!unmaskedMap[mem.id];
              const isSelected = selectedIds.includes(mem.id);
              const displayValue =
                mem.tier === 'secure' && !isUnmasked ? '••••••••••••••••' : mem.value;

              return (
                <div
                  key={mem.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    isSelected
                      ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/30'
                      : mem.tier === 'secure'
                      ? 'bg-red-500/5 dark:bg-red-950/10 border-red-500/20 hover:border-red-500/40'
                      : mem.tier === 'personal'
                      ? 'bg-amber-500/5 dark:bg-amber-950/10 border-amber-500/20 hover:border-amber-500/40'
                      : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700/60 hover:border-indigo-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(mem.id)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer shrink-0 mr-1"
                      />
                      {getTierBadge(mem.tier)}
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 font-mono">
                        {mem.key}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
                        {mem.category}
                      </span>
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center gap-1 shrink-0">
                      {mem.tier === 'secure' && (
                        <button
                          onClick={() => toggleMask(mem.id)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                          title={isUnmasked ? 'Mask Secret Value' : 'Show Secret Value'}
                        >
                          {isUnmasked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      )}

                      <button
                        onClick={() => handleCopy(mem.id, mem.value)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                        title="Copy Value"
                      >
                        {copiedId === mem.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setEditingId(mem.id);
                          setEditValue(mem.value);
                        }}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                        title="Edit Memory"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => onDeleteMemory(mem.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Delete Memory"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Memory Value */}
                  {isEditing ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        rows={2}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full p-2 text-xs bg-white dark:bg-zinc-900 border border-indigo-500 rounded-xl focus:outline-none"
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveEdit(mem.id)}
                          className="px-3 py-1 text-xs font-semibold bg-indigo-600 text-white rounded-lg shadow-sm"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 font-mono bg-white/50 dark:bg-zinc-900/50 p-2.5 rounded-xl border border-zinc-200/50 dark:border-zinc-800/80 break-all leading-relaxed">
                      {displayValue}
                    </p>
                  )}

                  {/* Tags and Metadata Footer */}
                  <div className="flex items-center justify-between mt-2 pt-1 text-[10px] text-zinc-400">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {mem.tags &&
                        mem.tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-0.5 px-2 py-0.2 rounded-md bg-zinc-200/60 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-300/40 dark:border-zinc-700/50 font-mono"
                          >
                            <Tag className="w-2.5 h-2.5 text-indigo-400" /> #{tag}
                          </span>
                        ))}
                    </div>
                    <span>
                      Updated {new Date(mem.updatedAt || mem.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors shadow-sm"
              title="Export memory vault to JSON file"
            >
              <Download className="w-3.5 h-3.5 text-indigo-500" />
              <span>Export Vault (.json)</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors shadow-sm"
              title="Import memory vault from local JSON file"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-500" />
              <span>Import Vault (.json)</span>
            </button>
          </div>

          <button
            onClick={onClearAllMemories}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-red-500 hover:bg-red-500/10 text-xs font-semibold transition-colors"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Clear All Vault Data
          </button>
        </div>
      </div>
    </div>
  );
};
