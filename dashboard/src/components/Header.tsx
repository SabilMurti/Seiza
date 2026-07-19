import React, { useState } from 'react';
import { Search, Server, Trash2, RefreshCcw } from 'lucide-react';

interface HeaderProps {
  onSearch: (query: string) => void;
  onClearLogs: () => void;
  onRefreshStats: () => void;
  config?: Record<string, unknown> | null; // left here just in case, but no longer rendered in Header
}
export const Header: React.FC<HeaderProps> = ({
  onSearch,
  onClearLogs,
  onRefreshStats,
  // config - keeping for interface compat
}) => {
  const [query, setQuery] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  return (
    <header className="bg-[#121215] border-b border-[#27272a] h-16 px-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
      {/* Search form */}
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-3 flex-1 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Global Search (Logs, Tasks, Agents)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-1.5 pl-9 text-sm font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-all"
          />
        </div>
      </form>

      {/* Right Stats & Status Badge row */}
      <div className="flex items-center gap-6">
        
        {/* Action Buttons */}
        <div className="flex items-center gap-2">
            <button
            onClick={onClearLogs}
            type="button"
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded font-mono text-xs transition-all"
            >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Logs</span>
            </button>

            <button
            onClick={onRefreshStats}
            type="button"
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded font-mono text-xs transition-all"
            >
            <RefreshCcw className="w-3.5 h-3.5" />
            <span>Refresh Stats</span>
            </button>
        </div>


        {/* Server Status Indicator Badge */}
        <div className="flex items-center gap-2 bg-zinc-900 border border-[#27272a] px-3 py-1.5 rounded select-none">
          <Server className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] font-mono text-emerald-400 font-semibold uppercase tracking-wider">Daemon Online</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
        </div>
      </div>
    </header>
  );
};
