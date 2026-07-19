import { useEffect, useState } from 'react';
import { SettingsTab } from './components/SettingsTab';
import { BridgeTab } from './components/BridgeTab';
import { Sidebar, type TabId } from './components/Sidebar';
import { Header } from './components/Header';
import { Network, Terminal, FileCode } from 'lucide-react';
interface LogEvent {
  id: string;
  timestamp: number;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  agent: 'system' | 'planner' | 'coder' | 'reviewer';
}
function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    
    const es = new EventSource('/api/events');
    es.addEventListener('task_started', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      console.log('Task started:', data);
    });

    fetch('/api/config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(err => console.error("Failed to load config", err));

    return () => es.close();
  }, []);

  const clearLogs = () => setLogs([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSearch = (_query: string) => {
    // no-op for now
  };
  return (
    <div className="w-screen h-screen overflow-hidden bg-[#09090b] flex font-sans text-zinc-100">
      {/* Left Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <Header 
          onSearch={handleSearch}
          onClearLogs={clearLogs}
          onRefreshStats={() => {
            showToast('Stats refreshed', 'success');
          }}
          config={config}
        />

        {/* Scrollable Workspace */}
        <main className="flex-1 min-h-0 relative p-6 overflow-y-auto">
          {activeTab === 'overview' && (
            <div className="h-full flex flex-col gap-6">
               {/* Replace with OverviewView later */}
               <div className="bg-[#121215] border border-[#27272a] rounded-lg p-6 flex-1 flex flex-col">
                  <h2 className="text-xl font-bold font-mono text-zinc-100 flex items-center gap-2 mb-4">
                    <Network className="w-5 h-5 text-emerald-400" />
                    DAG Pipeline & Live Logs
                  </h2>
                  <div className="flex-1 bg-[#09090b] rounded border border-[#27272a] p-4 font-mono text-xs overflow-auto">
                     {logs.map((log, i) => (
                        <div key={i} className="py-1 border-b border-[#27272a]/50">
                           <span className="text-zinc-500 mr-2">{new Date(log.timestamp).toLocaleTimeString()}</span>
                           <span className="text-emerald-400 mr-2">[{log.agent}]</span>
                           <span className="text-zinc-300">{log.message}</span>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="h-full flex flex-col">
               <h2 className="text-xl font-bold font-mono text-zinc-100 mb-6 flex items-center gap-2">
                 <Terminal className="w-5 h-5 text-emerald-400" />
                 Tasks History
               </h2>
               {/* Replace with TasksView later */}
            </div>
          )}

          {activeTab === 'bridge' && (
            <BridgeTab />
          )}

          {activeTab === 'directives' && (
            <div className="h-full flex flex-col">
               <h2 className="text-xl font-bold font-mono text-zinc-100 mb-6 flex items-center gap-2">
                 <FileCode className="w-5 h-5 text-emerald-400" />
                 Agent Directives
               </h2>
               {/* Replace with DirectivesView later */}
            </div>
          )}

          {activeTab === 'settings' && (
             <SettingsTab />
          )}
        </main>
      </div>

      {/* Toast Notifications */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4.5 py-3 rounded bg-zinc-900 border border-[#27272a] shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300 font-mono text-xs max-w-sm">
          <span className={toast.type === 'success' ? 'text-emerald-400' : toast.type === 'error' ? 'text-red-400' : 'text-[#f59e0b]'}>
            {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✗' : '⚡'}
          </span>
          <span className="text-zinc-200">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-zinc-500 hover:text-zinc-300">×</button>
        </div>
      )}
    </div>
  );
}

export default App;
