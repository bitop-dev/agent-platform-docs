# Agent Platform

An AI agent platform for building, running, and managing autonomous AI agents. Create agents with custom personas and skills, run them from the CLI or browser, stream output in real time, and manage everything through a web portal.

> **Status**: Phases 0–3 complete. Standalone agent binary, Go API server, and Next.js web portal all operational. 133 tests passing across repos.

---

## Repositories

| Repository | Language | Description | Status |
|---|---|---|---|
| [**agent-core**](https://github.com/bitop-dev/agent-core) | Go | Standalone CLI binary + `pkg/agent` library | ✅ Phase 1 complete — 69 files, 10K lines, 111 tests |
| [**agent-platform-api**](https://github.com/bitop-dev/agent-platform-api) | Go | REST API server with auth, persistence, WebSocket | ✅ Phase 2 complete — 32 files, 4.6K lines, 22 tests |
| [**agent-platform-web**](https://github.com/bitop-dev/agent-platform-web) | TypeScript | Next.js web portal | ✅ Phase 3 complete — 35 files, 3.1K lines, 12 pages |
| **skills** | Any | Community skill registry | 🔜 Phase 4 |
| [**agent-platform-docs**](https://github.com/bitop-dev/agent-platform-docs) (this repo) | Markdown | Architecture, design docs, planning | ✅ Comprehensive |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   platform-web (Next.js)                    │
│          Dashboard · Agents · Runs · Skills · Keys          │
└────────────────────────────┬────────────────────────────────┘
                             │ REST + WebSocket
┌────────────────────────────▼────────────────────────────────┐
│                   platform-api (Go/Fiber)                   │
│   JWT Auth · Agent CRUD · Runs · Skills · API Key Mgmt     │
│   Rate Limiting · WebSocket Hub · Goroutine Runner          │
└──────┬──────────────────────────────────────────────────────┘
       │ imports pkg/agent (Go library)
┌──────▼──────────────┐
│    agent-core       │
│    (Go binary)      │
│                     │
│  · 3 LLM Providers  │
│  · 8 Core Tools     │──── skills (SKILL.md packages)
│  · Skill Loader     │
│  · MCP Client       │──── MCP servers (stdio/HTTP)
│  · Context Mgmt     │
│  · Session Store    │
└──────┬──────────────┘
       │
┌──────▼──────────────────────────────────────────────────────┐
│                    LLM Providers                            │
│     OpenAI · Anthropic · Ollama · OpenAI-compatible         │
└─────────────────────────────────────────────────────────────┘
```

### Dependency Rules

- **`platform-web`** talks to `platform-api` over HTTP/WebSocket only. No Go, no direct DB.
- **`platform-api`** imports `agent-core/pkg/agent` as a Go library. Never runs it as a subprocess.
- **`agent-core`** works standalone. Never imports or calls the platform.
- **`skills`** is a data repo. No code depends on it — agent-core reads it at install/load time.

---

## What's Built

### agent-core (Phase 0 + 1) ✅

Standalone CLI binary that runs AI agents with tool calling, skill loading, and safety features.

- **3 LLM providers**: OpenAI Chat Completions, Anthropic Messages, OpenAI Responses (auto-detected from model name)
- **8 core tools**: `bash` (opt-out), `read_file`, `write_file`, `edit_file`, `list_dir`, `grep`, `http_fetch`, `tasks`
- **Skill system**: SKILL.md frontmatter parsing, system prompt injection, eligibility checks
- **MCP support**: stdio + HTTP transports for external tool servers
- **ReliableProvider**: 3-level failover, exponential backoff, API key rotation on 429
- **Context compaction**: proactive + reactive LLM-summarize with tool boundary guard
- **Loop detection**: no-progress, ping-pong, failure streak (two-phase: warn → stop)
- **Safety**: credential scrubbing, approval manager, safety heartbeat, deferred-action detection
- **Session persistence**: JSONL format, save/load/resume
- **Output formats**: text (streaming), JSON, JSONL
- **`pkg/agent` public API**: Builder pattern for embedding in other Go programs

### agent-platform-api (Phase 2) ✅

Go REST API server wrapping agent-core with persistence, auth, and real-time streaming.

- **Fiber v2** HTTP framework with structured logging (slog)
- **SQLite** (dev) / **PostgreSQL** (prod) with goose migrations and sqlc queries
- **JWT auth**: register, login, refresh tokens (access 60min, refresh 7 days)
- **Agent CRUD**: create, list, get, update (returns agent), delete with user isolation
- **Run execution**: async goroutine pool (4 workers), bridges API → agent-core
- **Run events**: full event capture (agent_start, text_delta, tool_call_start/end, agent_end)
- **Run cancellation**: POST /runs/:id/cancel with context.CancelFunc tracking
- **WebSocket hub**: room-based pub/sub by run ID for real-time streaming
- **Skills API**: CRUD + agent-skill linking (attach, detach, list per agent)
- **API key management**: AES-256-GCM encryption at rest, key hints, default per provider, base URL
- **Rate limiting**: token bucket per-IP (10/min auth, 120/min API)
- **Models catalog**: 11 models with context windows and pricing
- **Dashboard stats**: agent count, run status breakdown, recent runs
- **OpenAPI spec**: `openapi.yaml` covering all endpoints
- **Docker support**: Dockerfile + docker-compose.yml

### agent-platform-web (Phase 3) ✅

Next.js web portal with 12 pages for full agent management.

- **Dashboard**: stat cards (agents, runs, succeeded, failed) + recent runs list
- **Agent management**: grid view, create form (name, prompt, model picker), detail page, edit page
- **Run execution**: quick-run from agent detail, runs table with filtering
- **Run monitor**: live streaming output pane, collapsed timeline (tool calls highlighted, text deltas grouped), stop button
- **Skills browser**: card grid with tier badges and tags
- **API key management**: add/delete with provider, label, base URL, default toggle
- **Auth**: login/register with JWT, auto token refresh on 401, auth guard redirect
- **Tech**: Next.js 15 App Router, shadcn/ui + Tailwind (dark theme), Zustand, TanStack React Query, WebSocket

---

## Quick Start

### 1. Start the API server

```bash
cd agent-platform-api
make build
PORT=8080 JWT_SECRET=your-secret-32-chars-min DATABASE_URL=sqlite://data/platform.db ./bin/api
```

### 2. Start the web portal

```bash
cd agent-platform-web
echo "NEXT_PUBLIC_API_URL=http://localhost:8080" > .env.local
npm install && npm run dev
```

### 3. Or use agent-core standalone

```bash
cd agent-core
make build
export ANTHROPIC_API_KEY=sk-...
./bin/agent-core run --config examples/research-agent.yaml --mission "What are the top Go frameworks?"
```

---

## Build Roadmap

| Phase | Status | What |
|---|---|---|
| **0 — Core Runtime** | ✅ Done | Agent runs from CLI, streams to terminal |
| **1 — Tools + Skills** | ✅ Done | 8 tools, skill loader, MCP, safety features |
| **2 — Platform API** | ✅ Done | REST API, auth, persistence, WebSocket, skills API |
| **3 — Web Portal** | ✅ Done | 12-page Next.js app, live run streaming |
| **4 — Skill Hub** | 🔜 Next | Skills repo, skill picker UI, community contributions |
| **5 — Scheduler** | Planned | Cron-based agent scheduling |
| **6 — Skill Library** | Planned | 15+ production skills |
| **7 — Orchestration** | Planned | Multi-agent workflows |
| **8 — Hardening** | Planned | Containers, metrics, failover |
| **9 — Multi-User** | Future | Teams, OAuth, billing |

Detailed roadmap: [BLDER_DOCS/roadmap.md](BLDER_DOCS/roadmap.md)

---

## Documentation Index

All planning and architecture docs: [`BLDER_DOCS/`](BLDER_DOCS/)

| Document | Description |
|---|---|
| [architecture/overview.md](BLDER_DOCS/architecture/overview.md) | System architecture + component map |
| [architecture/agent-core.md](BLDER_DOCS/architecture/agent-core.md) | Agent runtime — turn loop, providers, events |
| [architecture/skill-registry.md](BLDER_DOCS/architecture/skill-registry.md) | Skill discovery, loading, and execution |
| [architecture/web-platform.md](BLDER_DOCS/architecture/web-platform.md) | Web portal routes, API design, UI components |
| [architecture/data-model.md](BLDER_DOCS/architecture/data-model.md) | Database schema for all entities |
| [agent-core-deep-dive.md](BLDER_DOCS/agent-core-deep-dive.md) | 920+ lines — code samples, YAML config, build order |
| [skill-registry-deep-dive.md](BLDER_DOCS/skill-registry-deep-dive.md) | 800+ lines — gap analysis, testing spec |
| [tools-deep-dive.md](BLDER_DOCS/tools-deep-dive.md) | Three-tier tool system design |
| [tech-stack.md](BLDER_DOCS/tech-stack.md) | Technology choices with rationale |
| [roadmap.md](BLDER_DOCS/roadmap.md) | 9-phase build plan |

### Diagrams

| Diagram | |
|---|---|
| [System Architecture](BLDER_DOCS/diagrams/01-system-architecture.png) | All repos + providers + MCP |
| [Tool Tiers](BLDER_DOCS/diagrams/02-tool-tiers.png) | Core → Skill → MCP |
| [Agent Turn Loop](BLDER_DOCS/diagrams/03-agent-turn-loop.png) | Main loop flowchart |
| [Skill Loading](BLDER_DOCS/diagrams/04-skill-loading.png) | Install + runtime flow |
| [Multi-Repo](BLDER_DOCS/diagrams/05-multi-repo.png) | Dependency graph |

---

## Key Design Decisions

| Decision | Choice | Why |
|---|---|---|
| Standalone-first | agent-core works with no platform | Validates core before building around it |
| SKILL.md over skill.json | Metadata in frontmatter, instructions in body | One file per skill, metadata travels with instructions |
| Subprocess tools | stdin/stdout JSON | Language-agnostic, sandboxed |
| Git-native registry | registry.json + Git URLs | No hosted service needed |
| bash is opt-out | Enabled by default | Most agents need shell access |
| Fiber v2 | HTTP framework for API | User preference, fast, middleware-rich |
| sqlc + goose | Type-safe SQL, embedded migrations | Compile-time safety, no ORM overhead |
| SQLite dev / Postgres prod | Auto-detected from DATABASE_URL | Zero-config dev, production-ready |
| JWT refresh tokens | Access 60min, refresh 7 days | Stateless, auto-refresh in frontend |
| API keys encrypted at rest | AES-256-GCM | Security baseline for stored credentials |

---

## License

TBD
