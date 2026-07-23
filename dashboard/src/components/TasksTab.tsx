import { useEffect, useState } from 'react';
import { Terminal, CheckCircle2, Clock, XCircle, Search, RefreshCw, Folder } from 'lucide-react';

interface TaskRecord {
  id: string;
  prompt: string;
  status: 'running' | 'completed' | 'failed' | 'waiting_approval';
  startTime?: string | number;
  endTime?: string | number;
  cwd?: string;
  model?: string;
  agent?: string;
}

export function TasksTab() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (e) {
      console.error('Failed to fetch tasks', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const filteredTasks = tasks.filter(t => {
    const s = search.toLowerCase();
    return (
      (t.prompt && t.prompt.toLowerCase().includes(s)) ||
      (t.id && t.id.toLowerCase().includes(s)) ||
      (t.cwd && t.cwd.toLowerCase().includes(s))
    );
  });

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-mono text-zinc-100 flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            Task Execution History
          </h2>
          <p className="text-xs font-mono text-zinc-400 mt-1">
            Track and inspect background DAG pipeline executions handled by Seiza sub-agents.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#121215] border border-[#27272a] rounded-lg pl-9 pr-4 py-2 font-mono text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 w-64"
            />
          </div>

          <button
            onClick={fetchTasks}
            className="flex items-center gap-2 px-3 py-2 bg-[#121215] hover:bg-[#18181b] border border-[#27272a] rounded-lg font-mono text-xs text-zinc-300 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Task List Table / Container */}
      <div className="flex-1 bg-[#121215] border border-[#27272a] rounded-lg p-5 flex flex-col min-h-0 overflow-y-auto">
        {filteredTasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-[#09090b]/40 rounded-lg border border-dashed border-[#27272a]">
            <Terminal className="w-12 h-12 text-zinc-600 mb-4 animate-pulse" />
            <h3 className="text-base font-mono font-bold text-zinc-200">No Tasks Recorded Yet</h3>
            <p className="text-xs font-mono text-zinc-400 max-w-md mt-2 leading-relaxed">
              When Antigravity or Head PM delegates heavy coding tasks via <code className="text-emerald-400">run_seiza_task</code> or <code className="text-emerald-400">run_single_agent</code>, task history will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTasks.map((t) => (
              <div
                key={t.id}
                className="bg-[#09090b] border border-[#27272a] hover:border-[#3f3f46] transition-colors rounded-lg p-4 font-mono text-xs"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-emerald-400">#{t.id.slice(0, 8)}</span>
                    {t.status === 'completed' && (
                      <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" /> Completed
                      </span>
                    )}
                    {t.status === 'running' && (
                      <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <Clock className="w-3 h-3 animate-spin" /> Running
                      </span>
                    )}
                    {t.status === 'failed' && (
                      <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                        <XCircle className="w-3 h-3" /> Failed
                      </span>
                    )}
                  </div>

                  {t.cwd && (
                    <div className="flex items-center gap-1 text-zinc-500 text-[11px]">
                      <Folder className="w-3 h-3 text-zinc-400" />
                      <span>{t.cwd}</span>
                    </div>
                  )}
                </div>

                <p className="text-zinc-200 leading-relaxed font-sans text-sm bg-[#121215] p-3 rounded border border-[#27272a]/50">
                  {t.prompt}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
