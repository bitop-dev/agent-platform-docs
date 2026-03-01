# Agent Platform

An AI agent platform for building, running, and managing autonomous AI agents. Create agents with custom personas and skills, run them from the CLI or browser, stream output in real time, and manage everything through a web portal.

> **Status**: Phases 0–4 complete. Standalone agent binary, Go API server, React web portal, and community skill registry all operational. 133 tests passing across repos.

---

## Repositories

| Repository | Language | Description | Status |
|---|---|---|---|
| [**agent-core**](https://github.com/bitop-dev/agent-core) | Go | Standalone CLI binary + `pkg/agent` library | ✅ 84 files, 11K lines, 111 tests, 26 commits |
| [**agent-platform-api**](https://github.com/bitop-dev/agent-platform-api) | Go | REST API server with auth, persistence, WebSocket | ✅ 62 files, 5.5K lines, 22 tests, 11 commits |
| [**agent-platform-web**](https://github.com/bitop-dev/agent-platform-web) | TypeScript | Bun + Vite + React web portal | ✅ 45 files, ~3K lines, 11 pages, 6 commits |
| [**agent-platform-skills**](https://github.com/bitop-dev/agent-platform-skills) | Python/Bash | Community skill registry (git-native) | ✅ 31 files, 5 skills, 2 commits |
| [**agent-platform-docs**](https://github.com/bitop-dev/agent-platform-docs) (this repo) | Markdown | Architecture, design docs, planning | ✅ Comprehensive |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              platform-web (Bun + Vite + React)              │
│          Dashboard · Agents · Runs · Skills · Keys          │
└────────────────────────────┬────────────────────────────────┘
                             │ REST + WebSocket
┌────────────────────────────▼────────────────────────────────┐
│                   platform-api (Go/Fiber)                   │
│   JWT Auth · Agent CRUD · Runs · Skills · API Key Mgmt     │
│   Rate Limiting · WebSocket Hub · Registry Sync             │
└──────┬────────────────────────────┬─────────────────────────┘
       │ imports pkg/agent          │ syncs registry.json
┌──────▼──────────────┐    ┌───────▼──────────────────┐
│    agent-core       │    │   Skill Sources (GitHub)  │
│    (Go binary)      │    │                           │
│                     │    │  bitop-dev/skills (default)│
│  · 3 LLM Providers  │    │  mycorp/skills (custom)   │
│  · 8 Core Tools     │    │  anyone/skills (community)│
│  · Skill Loader     │    └───────────────────────────┘
│  · MCP Client       │
│  · Context Mgmt     │
└──────┬──────────────┘
       │
┌──────▼──────────────────────────────────────────────────────┐
│                    LLM Providers                            │
│     OpenAI · Anthropic · Ollama · OpenAI-compatible         │
└─────────────────────────────────────────────────────────────┘
```

### Dependency Rules

- **`platform-web`** talks to `platform-api` over HTTP/WebSocket only
- **`platform-api`** imports `agent-core/pkg/agent` as a Go library
- **`agent-core`** works standalone — never imports the platform
- **`skills`** is a data repo — no code deps, agent-core reads at install/load time

---

## What's Built

### agent-core (Phases 0–1 + 4) ✅

Standalone CLI binary that runs AI agents with tool calling, skill loading, and safety features.

- **3 LLM providers**: OpenAI Chat Completions, Anthropic Messages, OpenAI Responses
- **8 core tools**: `bash` (opt-out), `read_file`, `write_file`, `edit_file`, `list_dir`, `grep`, `http_fetch`, `tasks`
- **Skill system**: install from GitHub registries, auto-install on run, SKILL.md parsing
- **Skill CLI**: `skill search`, `skill install`, `skill remove`, `skill update`, `skill list`, `skill show`
- **MCP support**: stdio + HTTP transports for external tool servers
- **ReliableProvider**: 3-level failover, exponential backoff, API key rotation
- **Context compaction**: proactive + reactive LLM-summarize with tool boundary guard
- **Safety**: loop detection, credential scrubbing, approval manager, heartbeat, deferred-action detection
- **Session persistence**: JSONL format, save/load/resume
- **`pkg/agent` public API**: Builder pattern for embedding in other Go programs

### agent-platform-api (Phases 2 + 4) ✅

Go REST API server wrapping agent-core with persistence, auth, and real-time streaming.

- **30+ REST endpoints** with JWT auth, rate limiting, request IDs
- **Multi-source skill registry**: syncs from GitHub on startup, users add custom repos
- **Run execution**: async goroutine pool, WebSocket live streaming
- **API key management**: AES-256-GCM encryption at rest
- **SQLite** (dev) / **PostgreSQL** (prod) with goose migrations and sqlc queries

### agent-platform-web (Phases 3 + 4) ✅

React SPA for full agent management.

- **11 pages**: dashboard, agents (CRUD), runs (list + live monitor), skills (browse + sources), API keys
- **Run monitor**: live streaming output + collapsed event timeline + stop button
- **Skill Hub**: browse skills from all sources, add custom GitHub repos
- **Tech**: Bun, Vite 7, React 19, Tailwind v4, shadcn/ui, React Query, Zustand

### agent-platform-skills (Phase 4) ✅

Git-native community skill registry.

- **5 skills**: web_search (DuckDuckGo), web_fetch (HTML→markdown), github (gh CLI), summarize, report
- **Contract**: any GitHub repo with `registry.json` + `skills/` directory is a valid source
- **Tested end-to-end**: agent-core installs skills, runs them with real LLM + real tools

---

## Quick Start

### Option A: Standalone CLI

```bash
cd agent-core && make build
export OPENAI_API_KEY=sk-...

# Install skills
./bin/agent-core skill install web_search
./bin/agent-core skill install summarize

# Run with skills
./bin/agent-core run -c examples/research-agent.yaml \
  --mission "Search for Go 1.24 changes and summarize"
```

### Option B: Full Platform

```bash
# 1. Start API
cd agent-platform-api
PORT=8090 JWT_SECRET=dev-secret-change-me-32chars-min DATABASE_URL=sqlite://data/platform.db go run ./cmd/api

# 2. Start Web
cd agent-platform-web
echo "VITE_API_URL=http://localhost:8090" > .env
bun install && bun run dev --port 3002

# 3. Open http://localhost:3002
# Register → Store API Key → Create Agent → Run → Watch live output
```

---

## Build Roadmap

| Phase | Status | What |
|---|---|---|
| **0 — Core Runtime** | ✅ Done | Agent runs from CLI, streams to terminal |
| **1 — Tools + Skills** | ✅ Done | 8 tools, skill loader, MCP, safety features |
| **2 — Platform API** | ✅ Done | REST API, auth, persistence, WebSocket |
| **3 — Web Portal** | ✅ Done | 11-page React app, live run streaming |
| **4 — Skill Hub** | ✅ Done | Skills repo, multi-source registry, skill install CLI, UI |
| **5 — Scheduler** | 🔜 Next | Cron-based agent scheduling |
| **6 — Skill Library** | Planned | 15+ production skills |
| **7 — Orchestration** | Planned | Multi-agent workflows |
| **8 — Hardening** | Planned | Containers, metrics, failover |
| **9 — Multi-User** | Future | Teams, OAuth, billing |

Detailed roadmap: [BLDER_DOCS/roadmap.md](BLDER_DOCS/roadmap.md)

---

## Documentation

All planning and architecture docs: [`BLDER_DOCS/`](BLDER_DOCS/)

| Document | Description |
|---|---|
| [architecture/overview.md](BLDER_DOCS/architecture/overview.md) | System architecture + component map |
| [architecture/agent-core.md](BLDER_DOCS/architecture/agent-core.md) | Agent runtime design |
| [architecture/skill-registry.md](BLDER_DOCS/architecture/skill-registry.md) | Skill discovery and execution |
| [architecture/web-platform.md](BLDER_DOCS/architecture/web-platform.md) | Web portal design |
| [architecture/data-model.md](BLDER_DOCS/architecture/data-model.md) | Database schema |
| [agent-core-deep-dive.md](BLDER_DOCS/agent-core-deep-dive.md) | 920+ lines — code samples, YAML config |
| [skill-registry-deep-dive.md](BLDER_DOCS/skill-registry-deep-dive.md) | 800+ lines — gap analysis, testing spec |
| [tools-deep-dive.md](BLDER_DOCS/tools-deep-dive.md) | Three-tier tool system design |
| [roadmap.md](BLDER_DOCS/roadmap.md) | 9-phase build plan |

---

## License

MIT
