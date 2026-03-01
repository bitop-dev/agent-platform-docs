# Tech Stack

Technology decisions for the Agent Platform, with rationale.

---

## Backend: Go

**Why Go?**
- This repository is already in the Go ecosystem
- Excellent concurrency primitives (`goroutines`, `channels`) — perfect for running many agent sessions in parallel
- Single binary deployment
- Strong standard library (`net/http`, `context`, `encoding/json`)
- `gastown` (opensrc reference) is a mature Go multi-agent system we can study

**Key Go Libraries**

| Library | Purpose | Rationale |
|---|---|---|
| `chi` | HTTP router | Lightweight, idiomatic, middleware-friendly |
| `pgx` / `sqlc` | PostgreSQL driver + query gen | Type-safe, no ORM magic |
| `golang-migrate` | DB migrations | Battle-tested migration tool |
| `golang-jwt/jwt` | JWT auth | Standard library for JWT |
| `gorilla/websocket` | WebSocket | Stable, widely used |
| `robfig/cron` | Cron expression parsing | The standard Go cron library |
| `invopop/jsonschema` | JSON Schema gen from Go structs | For tool definitions |
| `riverqueue/river` | Background job queue (PostgreSQL) | No extra infra needed for job queue |
| `zap` | Structured logging | High performance, structured |
| `viper` | Config management | Env vars + config file support |

---

## Frontend: Next.js + React

**Why Next.js?**
- App Router provides excellent file-based routing for our page structure
- SSR for initial page load performance
- API routes for lightweight BFF (Backend For Frontend) patterns
- Strong TypeScript support
- `pi-mono/packages/web-ui` (opensrc reference) has React AI chat components

**Key Frontend Libraries**

| Library | Purpose |
|---|---|
| `shadcn/ui` | Component library (accessible, Radix-based) |
| `tailwindcss` | Utility-first CSS |
| `@tanstack/react-query` | Server state / data fetching |
| `zustand` | Client state management |
| `react-hook-form` + `zod` | Form handling + validation |
| `monaco-editor` | Code/markdown editor for skill creator |
| `@uiw/react-markdown-editor` | Rich markdown editor for system prompts |
| `recharts` | Charts for run metrics / cost tracking |
| `@radix-ui/react-*` | Accessible UI primitives (via shadcn) |
| `lucide-react` | Icon set |
| `date-fns` | Date/time formatting |

---

## Database: PostgreSQL

- **Primary store**: PostgreSQL for all structured data
- **Dev/local**: SQLite via `modernc.org/sqlite` (same SQL, zero setup)
- **Migrations**: `golang-migrate`
- **Query layer**: `sqlc` — compile-time SQL query generation (no ORM)

The schema is designed so the same migrations work on both SQLite (dev) and PostgreSQL (prod), using the ANSI SQL subset.

---

## Storage: Object Store

For run logs, large outputs, and file attachments:
- **Dev**: local filesystem (`./data/runs/`)
- **Prod**: S3-compatible (AWS S3, Cloudflare R2, MinIO)
- Interface-driven: `type LogStore interface { Write(...) Read(...) }` so the backend is swappable

---

## LLM Providers

The platform supports multiple LLM providers via a unified interface:

| Provider | Notes |
|---|---|
| **Anthropic** (Claude) | Primary default. Claude claude-sonnet-4 for balance, Claude Opus 4 for power |
| **OpenAI** | GPT-4o, o3, etc. |
| **Google** | Gemini models |
| **Ollama** | Local models (for privacy, offline, cost) |

**Reference**: `pi-mono/packages/ai` implements this exact pattern in TypeScript. We mirror the interface design in Go.

API keys are stored encrypted in the DB. The agent config references an `api_key_id`, never the raw key.

---

## Deployment Options

### Option A: Single Binary (MVP / Self-hosted)
```
./agent-platform serve
```
- Serves API + static frontend assets from one binary
- SQLite database, local filesystem storage
- No external dependencies
- Perfect for personal use / self-hosting

### Option B: Docker Compose (Small teams)
```yaml
services:
  api:      # Go API server
  frontend: # Next.js (or embedded in API)
  db:       # PostgreSQL
  # No Redis needed if using River queue
```

### Option C: Production Cloud
- Go API server on Cloud Run / Fly.io / Kubernetes
- PostgreSQL on managed service (Supabase, Neon, RDS)
- S3 for log storage
- Next.js on Vercel or same container

---

## Repository Structure

The platform lives in four separate repositories. See [repository-structure.md](../repository-structure.md) for full detail on boundaries and rationale.

### `agent-core` — standalone binary + Go library
```
agent-core/
├── cmd/agent-core/     # CLI entrypoint (cobra)
├── internal/           # Private implementation
│   ├── agent/          # Turn loop, events, loop detection
│   ├── provider/       # LLM provider implementations
│   ├── tool/           # Tool interface, built-ins, subprocess runner
│   ├── skill/          # SKILL.md loader
│   ├── config/         # YAML config (viper)
│   └── output/         # Text / JSON / JSONL renderers
├── pkg/agent/          # Public API (imported by platform-api)
├── skills/             # Bundled skills shipped with the binary
├── examples/           # Example agent YAML configs
└── go.mod              # module github.com/[org]/agent-core
```

### `skills` — community skill registry
```
skills/
├── registry.json       # Index of all skills
├── github/
│   ├── skill.json      # Metadata (name, version, description, tags)
│   ├── SKILL.md        # Injected into agent system prompt
│   └── tools/          # Tool schemas + implementations
├── web_search/
├── summarize/
└── ...
```

### `platform-api` — Go API server
```
platform-api/
├── cmd/server/         # API server entrypoint
├── internal/
│   ├── api/            # HTTP handlers, routing, middleware
│   ├── runner/         # Wraps agent-core, manages run workers
│   ├── scheduler/      # Cron engine, job manager
│   ├── storage/        # DB layer (sqlc-generated)
│   ├── skillsync/      # Syncs from skills repo → local registry
│   └── auth/           # JWT, password hashing
├── migrations/         # SQL migration files
└── go.mod              # imports github.com/[org]/agent-core
```

### `platform-web` — Next.js web portal
```
platform-web/
├── app/                # Next.js App Router pages
│   ├── agents/
│   ├── skills/
│   ├── runs/
│   └── settings/
├── components/         # Shared React components
│   ├── AgentBuilder/
│   ├── RunMonitor/
│   └── SkillHub/
└── lib/                # API client, hooks, utilities
```

---

## Development Tooling

| Tool | Purpose |
|---|---|
| `air` | Hot reload for Go during development |
| `sqlc` | Generate type-safe Go from SQL queries |
| `golang-migrate` | Run DB migrations |
| `golangci-lint` | Go linting |
| `goreleaser` | Cross-platform binary releases |
| `vitest` | Frontend unit tests |
| `playwright` | Frontend E2E tests |
| `docker compose` | Local dev environment |
