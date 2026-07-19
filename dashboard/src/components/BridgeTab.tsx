import { useState, useEffect } from 'react';
import { LucideServer, LucidePlus, LucideTrash2, LucidePlay, LucideStopCircle } from 'lucide-react';

export function BridgeTab() {
  const [servers, setServers] = useState<any[]>([]);
  const [serverTools, setServerTools] = useState<any[]>([]);
  
  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = () => {
    fetch('/api/bridge/servers')
      .then(res => res.json())
      .then(data => setServers(data))
      .catch(console.error);
  };

  const addServer = async () => {
    const name = prompt("Server ID (e.g. mcp-sqlite):");
    if (!name) return;
    const command = prompt("Command (e.g. npx):");
    if (!command) return;
    const argsStr = prompt("Args (comma separated, e.g. -y,@modelcontextprotocol/server-sqlite,/tmp/test.db):");
    const args = argsStr ? argsStr.split(",").map(s => s.trim()) : [];
    
    const newServer = {
      id: name,
      name: name,
      command,
      args,
      enabled: true
    };

    try {
      await fetch('/api/bridge/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newServer)
      });
      fetchServers();
    } catch (e) {
      console.error(e);
      alert('Failed to add server');
    }
  };

  const removeServer = async (id: string) => {
    if (!confirm(`Remove server ${id}?`)) return;
    try {
      await fetch(`/api/bridge/servers/${id}`, { method: 'DELETE' });
      fetchServers();
      if (selectedServer === id) {
         setSelectedServer(null);
         setServerTools([]);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to remove server');
    }
  };

  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<any | null>(null);
  const [toolArgs, setToolArgs] = useState<string>('{}');
  const [toolResult, setToolResult] = useState<string>('');
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    if (selectedServer) {
      fetch(`/api/bridge/tools?serverId=${selectedServer}`)
        .then(res => res.json())
        .then(data => setServerTools(data))
        .catch(console.error);
      setSelectedTool(null);
      setToolResult('');
    }
  }, [selectedServer]);

  const handleExecuteTool = async () => {
    if (!selectedServer || !selectedTool) return;
    setExecuting(true);
    setToolResult('Executing...');
    try {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(toolArgs);
      } catch (e) {
        setToolResult('Invalid JSON arguments');
        setExecuting(false);
        return;
      }
      const res = await fetch('/api/bridge/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: selectedServer,
          toolName: selectedTool.name,
          arguments: parsedArgs
        })
      });
      const data = await res.json();
      setToolResult(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setToolResult(String(e));
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4 overflow-hidden mx-auto w-full">
      {/* Left Column: Servers */}
      <div className="w-80 flex flex-col bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden shrink-0">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
          <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
             <LucideServer className="w-4 h-4 text-emerald-400" /> Bridge Servers
          </h3>
          <button onClick={addServer} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-100" title="Add custom server">
            <LucidePlus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {servers.map(s => (
            <div 
              key={s.id} 
              onClick={() => setSelectedServer(s.id)}
              className={`p-3 rounded border cursor-pointer group ${selectedServer === s.id ? 'bg-emerald-900/20 border-emerald-500/50' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${s.enabled ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                  <span className="font-medium text-zinc-200 truncate">{s.name}</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); removeServer(s.id); }} className="text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                   <LucideTrash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="text-xs font-mono text-zinc-500 break-all">{s.command} {s.args?.join(' ')}</div>
            </div>
          ))}
          {servers.length === 0 && (
            <div className="text-sm text-zinc-500 text-center py-4">No servers registered.</div>
          )}
        </div>
      </div>

      {/* Middle Column: Tools Directory */}
      <div className="flex-1 flex flex-col bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden min-w-0">
        <div className="p-4 border-b border-zinc-800 bg-zinc-950">
           <h3 className="font-semibold text-zinc-100">
             {selectedServer ? `Tools for ${selectedServer}` : 'Select a server'}
           </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 xl:grid-cols-2 gap-3 content-start">
           {!selectedServer && (
             <div className="col-span-full text-center text-zinc-500 py-10">Select a server to view its tools.</div>
           )}
           {selectedServer && serverTools.length === 0 && (
             <div className="col-span-full text-center text-zinc-500 py-10">No tools found for this server.</div>
           )}
           {serverTools.map(t => (
             <div 
               key={t.name}
               onClick={() => {
                 setSelectedTool(t);
                 setToolArgs(JSON.stringify(t.inputSchema?.properties || {}, null, 2));
                 setToolResult('');
               }}
               className={`p-4 rounded border cursor-pointer transition-colors flex flex-col gap-2 ${selectedTool?.name === t.name ? 'bg-emerald-900/20 border-emerald-500/50' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'}`}
             >
               <div className="font-mono text-sm text-emerald-400 font-semibold truncate">{t.name}</div>
               <div className="text-xs text-zinc-400 line-clamp-3" title={t.description}>{t.description || 'No description provided.'}</div>
               <div className="mt-auto text-xs text-zinc-600 font-mono pt-2 border-t border-zinc-800">
                 {Object.keys(t.inputSchema?.properties || {}).length} parameters
               </div>
             </div>
           ))}
        </div>
      </div>

      {/* Right Column: Sandbox */}
      <div className="w-[420px] flex flex-col bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden shrink-0">
        <div className="p-4 border-b border-zinc-800 bg-zinc-950 flex justify-between items-center">
           <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
             <LucidePlay className="w-4 h-4 text-emerald-400" /> Tool Sandbox
           </h3>
        </div>
        {selectedTool ? (
          <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
            <div className="flex-shrink-0">
               <div className="font-mono text-sm text-emerald-400 mb-1 truncate">{selectedTool.name}</div>
               <div className="text-xs text-zinc-400 line-clamp-3">{selectedTool.description}</div>
            </div>
            
            <div className="flex flex-col gap-2 shrink-0">
              <label className="text-xs text-zinc-400 font-medium">Arguments (JSON)</label>
              <textarea 
                value={toolArgs}
                onChange={(e) => setToolArgs(e.target.value)}
                className="w-full h-40 bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 font-mono text-xs focus:border-emerald-500 focus:outline-none resize-none custom-scrollbar"
                spellCheck={false}
              />
            </div>
            
            <button 
              onClick={handleExecuteTool}
              disabled={executing}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-100 py-2 rounded font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shrink-0"
            >
              {executing ? <LucideStopCircle className="w-4 h-4 animate-spin" /> : <LucidePlay className="w-4 h-4" />}
              {executing ? 'Executing...' : 'Execute Tool'}
            </button>

            <div className="flex-1 flex flex-col gap-2 min-h-0">
              <label className="text-xs text-zinc-400 font-medium">Output</label>
              <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded p-3 overflow-auto custom-scrollbar">
                 <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap break-words">
                   {toolResult || 'No output yet.'}
                 </pre>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm p-8 text-center">
            Select a tool from the middle column to execute it.
          </div>
        )}
      </div>
    </div>
  );
}