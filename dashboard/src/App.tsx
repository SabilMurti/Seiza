import { useEffect, useState } from 'react';
import { SettingsTab } from './components/SettingsTab';
import { BridgeTab } from './components/BridgeTab';
import { Sidebar, type TabId } from './components/Sidebar';
import { SkillsTab } from './components/SkillsTab';
import { DirectivesTab } from './components/DirectivesTab';
import { OverviewTab } from './components/OverviewTab';
import { TasksTab } from './components/TasksTab';
import { Header } from './components/Header';

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const [config, setConfig] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(err => console.error("Failed to load config", err));
  }, []);

  const clearLogs = () => {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSearch = (_query: string) => {
    // no-op for now
  };
  return (
    <div className="w-screen h-screen overflow-hidden bg-[#09090b] flex font-sans text-zinc-100 md:flex-row flex-col">
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
            <OverviewTab />
          )}

          {activeTab === 'tasks' && (
            <TasksTab />
          )}

          {activeTab === 'bridge' && (
            <BridgeTab />
          )}
          {activeTab === 'skills' && (
            <SkillsTab />
          )}

          {activeTab === 'directives' && (
            <DirectivesTab />
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
