import { useState, useEffect } from 'react';
import { LucideServer, LucidePlus, LucideTrash2, LucidePlay, LucideStopCircle } from 'lucide-react';

export function BridgeTab() {
  const [servers, setServers] = useState<any[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  
  useEffect(() => {
    fetchServers();
    fetchTools();
  }, []);

  const fetchServers = () => {
    fetch('/api/bridge/servers')
      .then(res => res.json())
      .then(data => setServers(data))
      .catch(console.error);
  };

  const fetchTools = () => {
    fetch('/api/bridge/tools')
      .then(res => res.json())
      .then(data => setTools(data))
      .catch(console.error);
  };

  const handleSaveServers = async (newServers: any[]) => {
    try {
      await fetch('/api/bridge/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newServers)
      });
      setServers(newServers);
      setTimeout(fetchTools, 1000); // Reload tools after a short delay
    } catch (e) {
      console.error(e);
      alert('Failed to save servers');
    }
  };

  const toggleServer = (id: string) => {
    const updated = servers.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s);
    handleSaveServers(updated);
  };

  const removeServer = (id: string) => {
    const updated = servers.filter(s => s.id !== id);
    handleSaveServers(updated);
  };

  const addServer = () => {
    const newServer = {
      id: `server-${Date.now()}`,
      name: 'New Server',
      command: 'node',
      args: ['path/to/server.js'],
      enabled: false
    };
    handleSaveServers([...servers, newServer]);
  };

  return (
    <div className="p-8 space-y-8 max-w-5xl">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <h2 className="text-2xl font-semibold text-emerald-400 flex items-center gap-3">
          <LucideServer className="w-6 h-6" /> Universal MCP Bridge
        </h2>
        <button 
          onClick={addServer}
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2"
        >
          <LucidePlus className="w-4 h-4" /> Add Server
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-zinc-200">Connected Servers</h3>
          {servers.length === 0 ? (
            <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-500 text-center">
              No bridge servers configured.
            </div>
          ) : (
            servers.map(server => (
              <div key={server.id} className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <input 
                    type="text" 
                    value={server.name}
                    onChange={(e) => {
                      const updated = servers.map(s => s.id === server.id ? { ...s, name: e.target.value } : s);
                      setServers(updated);
                    }}
                    onBlur={() => handleSaveServers(servers)}
                    className="bg-transparent border-none text-emerald-400 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded px-1"
                  />
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleServer(server.id)} className={`p-1.5 rounded ${server.enabled ? 'text-emerald-400 hover:bg-emerald-400/10' : 'text-zinc-500 hover:bg-zinc-800'}`}>
                      {server.enabled ? <LucideStopCircle className="w-5 h-5" /> : <LucidePlay className="w-5 h-5" />}
                    </button>
                    <button onClick={() => removeServer(server.id)} className="p-1.5 text-rose-400 hover:bg-rose-400/10 rounded">
                      <LucideTrash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-zinc-500">Command</label>
                    <input 
                      type="text" 
                      value={server.command}
                      onChange={(e) => {
                        const updated = servers.map(s => s.id === server.id ? { ...s, command: e.target.value } : s);
                        setServers(updated);
                      }}
                      onBlur={() => handleSaveServers(servers)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-300 focus:border-emerald-500 focus:outline-none mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">Args (comma separated)</label>
                    <input 
                      type="text" 
                      value={server.args.join(', ')}
                      onChange={(e) => {
                        const args = e.target.value.split(',').map(a => a.trim()).filter(Boolean);
                        const updated = servers.map(s => s.id === server.id ? { ...s, args } : s);
                        setServers(updated);
                      }}
                      onBlur={() => handleSaveServers(servers)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-300 focus:border-emerald-500 focus:outline-none mt-1"
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-medium text-zinc-200">Exposed Tools ({tools.length})</h3>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex flex-col max-h-[600px]">
            <div className="overflow-y-auto p-4 space-y-3">
              {tools.length === 0 ? (
                <div className="text-zinc-500 text-center py-8">No tools available. Enable a server to load tools.</div>
              ) : (
                tools.map(tool => (
                  <div key={tool.name} className="bg-zinc-950 border border-zinc-800 rounded p-3">
                    <div className="text-emerald-400 font-medium font-mono text-sm mb-1">{tool.name}</div>
                    <div className="text-zinc-400 text-sm mb-2">{tool.description}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
