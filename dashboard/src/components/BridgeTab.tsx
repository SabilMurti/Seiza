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
    <div className="flex h-full overflow-hidden mx-auto w-full">
      {/* Left Column: Servers */}
      <div className="w-64 border-r border-[#27272a] bg-[#121215] flex flex-col shrink-0">
        <div className="flex items-center justify-between p-4 border-b border-[#27272a]">
          <h2 className="font-mono text-xs font-bold text-zinc-400">MCP BRIDGE SERVERS</h2>
          <button
            onClick={addServer}
            className="bg-[#f59e0b] hover:bg-[#d97706] text-black px-2 py-1 rounded font-mono text-xs font-semibold flex items-center gap-1"
          >
            <LucidePlus className="w-3.5 h-3.5" />
            Add Server
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {servers.map((server) => (
            <div
              key={server.id}
              onClick={() => setSelectedServer(server.id)}
              className={`p-3 rounded border cursor-pointer transition-colors ${
                selectedServer === server.id
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-[#09090b] border-[#27272a] hover:border-zinc-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 overflow-hidden">
                  <LucideServer
                    className={`w-4 h-4 shrink-0 ${
                      selectedServer === server.id ? 'text-emerald-400' : 'text-zinc-500'
                    }`}
                  />
                  <span className="font-mono text-xs font-bold text-zinc-200 truncate">
                    {server.name}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeServer(server.id);
                  }}
                  className="text-zinc-500 hover:text-red-400 transition-colors"
                >
                  <LucideTrash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="font-mono text-[10px] text-zinc-500 font-semibold mt-1 break-all">
                {server.command} {server.args?.join(' ')}
              </div>
            </div>
          ))}
          {servers.length === 0 && (
            <div className="text-zinc-500 text-sm p-4 text-center border border-dashed border-[#27272a] rounded">
              No bridge servers configured.
            </div>
          )}
        </div>
      </div>

      {/* Middle Column: Tools Directory */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#09090b]">
        <div className="p-4 border-b border-[#27272a] bg-[#121215]">
           <h3 className="font-mono text-xs font-bold text-zinc-400">
             {selectedServer ? `TOOLS FOR ${selectedServer.toUpperCase()}` : 'SELECT A SERVER'}
           </h3>
        </div>
        <div className="flex-1 flex flex-col gap-3 overflow-y-auto p-4">
           {!selectedServer && (
             <div className="text-center text-zinc-500 py-10 font-mono text-xs">Select a server to view its tools.</div>
           )}
           {selectedServer && serverTools.length === 0 && (
             <div className="text-center text-zinc-500 py-10 font-mono text-xs">No tools found for this server.</div>
           )}
           {serverTools.map(t => (
             <div 
               key={t.name}
               onClick={() => {
                 setSelectedTool(t);
                 setToolArgs(JSON.stringify(t.inputSchema?.properties || {}, null, 2));
                 setToolResult('');
               }}
               className={`p-4 rounded border cursor-pointer transition-colors flex flex-col gap-2 ${selectedTool?.name === t.name ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-[#121215] border-[#27272a] hover:border-zinc-700'}`}
             >
               <div className="flex items-center justify-between gap-4">
                 <div className="font-mono text-sm font-bold text-zinc-100 break-all">{t.name}</div>
                 <div className="text-[10px] font-mono text-zinc-400 bg-zinc-950 border border-zinc-800 px-2 py-0.5 rounded uppercase font-bold shrink-0">TOOL</div>
               </div>
               <div className="font-sans text-xs text-zinc-400 leading-relaxed">{t.description || 'No description provided.'}</div>
               <div className="mt-auto text-[10px] text-zinc-500 font-mono pt-3 border-t border-[#27272a]/50">
                 {Object.keys(t.inputSchema?.properties || {}).length} parameters
               </div>
             </div>
           ))}
        </div>
      </div>

      {/* Right Column: Sandbox */}
      <div className="w-[420px] flex flex-col bg-[#121215] border-l border-[#27272a] shrink-0">
        <div className="p-4 border-b border-[#27272a] flex justify-between items-center">
           <h3 className="font-mono text-xs font-bold text-zinc-400 flex items-center gap-2">
             <LucidePlay className="w-3.5 h-3.5 text-emerald-400" /> TOOL SANDBOX
           </h3>
        </div>
        {selectedTool ? (
          <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
            <div className="flex-shrink-0">
               <div className="font-mono text-sm font-bold text-emerald-400 mb-1 break-all">{selectedTool.name}</div>
               <div className="font-sans text-xs text-zinc-400 leading-relaxed">{selectedTool.description}</div>
            </div>
            
            <div className="flex flex-col gap-2 shrink-0">
              <label className="font-mono text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Arguments (JSON)</label>
              <textarea 
                value={toolArgs}
                onChange={(e) => setToolArgs(e.target.value)}
                className="w-full h-40 bg-[#09090b] border border-[#27272a] rounded p-3 text-zinc-200 font-mono text-xs focus:border-emerald-500 focus:outline-none resize-none custom-scrollbar"
                spellCheck={false}
              />
            </div>
            
            <button 
              onClick={handleExecuteTool}
              disabled={executing}
              className="w-full bg-[#f59e0b] hover:bg-[#d97706] text-black py-2.5 rounded font-mono text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shrink-0"
            >
              {executing ? <LucideStopCircle className="w-3.5 h-3.5 animate-spin" /> : <LucidePlay className="w-3.5 h-3.5" />}
              {executing ? 'EXECUTING...' : 'EXECUTE TOOL'}
            </button>

            <div className="flex-1 flex flex-col gap-2 min-h-0">
              <label className="font-mono text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Output</label>
              <div className="flex-1 bg-[#09090b] border border-[#27272a] p-3 rounded font-mono text-[11px] text-zinc-300 overflow-auto custom-scrollbar">
                 <pre className="whitespace-pre-wrap break-words">
                   {toolResult || 'No output yet.'}
                 </pre>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500 font-mono text-xs p-8 text-center">
            Select a tool from the middle column to execute it.
          </div>
        )}
      </div>
    </div>
  );
}