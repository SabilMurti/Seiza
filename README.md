# 🌌 Seiza (星座)

> **Native TypeScript AI Orchestration Engine & MCP Server with Real-Time Bento Web Dashboard.**

Seiza acts as the high-performance execution layer for Head AI Architect agents (such as Antigravity IDE and Oh My Pi), coordinating specialized autonomous sub-agents (*Planner*, *Coder*, *Reviewer*, *Scout*, *Librarian*, *Tester*, *Designer*, *Security*) using OpenAI-compatible endpoints (e.g. **9Router**) with DAG parallel execution, multi-agent consensus validation, sandboxing, and interactive Human-In-The-Loop (HITL) authorization.

---

```mermaid
graph TD
    Parent[Antigravity IDE / Oh My Pi Agent] <-->|MCP Protocol: run_seiza_task| Server[Seiza MCP Server]
    Server <-->|Native Engine| Core[DAG Scheduler & Engine]
    Core -->|Topological Sort| DAGRunner[DAG Parallel Runner]
    DAGRunner -->|Parallel Spawns| Runner[Sub-Agent Execution Loop]
    Runner <-->|LLM / Streaming API| Router[9Router Model Router & Fallback]
    Runner <-->|Coder/Reviewer Dialogue| Consensus[Consensus Manager]
    Runner <-->|Isolated Commands| Sandbox[Sandbox Layer]
    Runner <-->|Proxy MCP Tools| Bridge[MCP Bridge Server]
    Bridge <-->|FTS5 Memory & Graph| Amneshia[Amneshia Memory Hub]
    Bridge <-->|Code Discovery| CodebaseMCP[Codebase Memory MCP]
    Server <-->|Express REST / SSE| Dashboard[React + Vite Bento Dashboard]
```

---

## ✨ Features

- ⚡ **DAG-Based Parallel Orchestration**: Automatically breaks complex coding prompts into topological dependency graphs and executes non-dependent steps in parallel.
- 🤝 **Multi-Agent Peer Review (Consensus Engine)**: Enforces automated Coder-Reviewer dialogue loops to verify diffs and safety before applying changes.
- 🛡️ **Dynamic Model Router & Auto-Fallback**: Integrates with 9Router daemon. Automatically retries failing models with zero-downtime fallback strategies.
- 🌉 **Universal Downstream MCP Bridge**: Seamlessly bridges tools from **Amneshia** (SQLite FTS5 Long-Term Memory Hub), **Codebase Memory MCP**, and **Context7**.
- 🔒 **Human-In-The-Loop (HITL)**: Intercepts destructive commands or tasks containing `#butuh-manusia`, pausing execution until approved via the Bento Web Dashboard.
- 📊 **Real-Time Bento Web Dashboard**: Premium React 18 + Tailwind UI featuring live DAG graphs, SSE streaming logs, agent directive editors, and token counters.
- 💾 **Context Inflation Shield**: Logs complete sub-agent execution trails into local SQLite (`sessions.db`) while returning concise abstractions to the parent agent.

---

## ⚡ Quick Start

### 1. Standard MCP Server Setup (Stdio Mode)

Add Seiza to your MCP configuration file (`mcp_config.json` or `~/.omp/agent/config.yml`):

```json
{
  "mcpServers": {
    "seiza": {
      "command": "wsl.exe",
      "args": [
        "-e",
        "env",
        "PATH=/home/murtix/.local/share/fnm/node-versions/v24.18.0/installation/bin:/usr/bin:/bin",
        "/home/murtix/.local/share/fnm/node-versions/v24.18.0/installation/bin/seiza"
      ]
    }
  }
}
```

### 2. Standalone HTTP Server & Web Dashboard

Run the server with the web dashboard enabled on port `3456`:

```bash
seiza --http --port 3456
```

Or run in background daemon mode:

```bash
seiza --http --daemon
```

Open your browser at `http://localhost:3456` to access the Seiza Web Dashboard.

---

## 🔌 Downstream MCP Bridge Integration

Seiza can proxy tools from downstream MCP servers directly into sub-agent execution loops:

- **Amneshia**: Zero-external-DB SQLite FTS5 long-term memory hub & knowledge graph.
- **Codebase Memory MCP**: Graph-based structural code discovery, Cypher queries, and trace paths.
- **Context7**: Official up-to-date documentation engine for modern frameworks.

Manage bridge servers dynamically in the dashboard under the **Bridge** tab or in `~/.seiza/config.json`.

---

## 🛠️ Development & Building

```bash
# Install root dependencies
npm install

# Typecheck and build backend
npm test
npm run build

# Build Web Dashboard
cd dashboard
npm install
npm run build
```

---

## 📄 License

MIT © Sabil Murti
