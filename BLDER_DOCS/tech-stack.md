# Tech Stack

Technology decisions for the Agent Platform, with rationale. Updated to reflect actual implementation choices.

---

## Backend: Go

**Why Go?**
- Excellent concurrency primitives (`goroutines`, `channels`) — perfect for running many agent sessions in parallel
- Single binary deployment
- Strong standard library (`net/http`, `context`, `encoding/json`)
- `gastown` (opensrc reference) is a mature Go multi-agent system

### agent-core Dependencies

| Library | Purpose | Status |
|---|---|---|
| `spf13/cobra` | CLI framework | ✅ Implemented |
| `spf13/viper` | Config management (env + files) | ✅ Implemented |
| `gopkg.in/yaml.v3` | YAML parsing for agent configs | ✅ Implemented |
| `chzyer/readline` | Interactive chat REPL | ✅ Implemented |

### agent-platform-api Dependencies

| Library | Purpose | Status |
|---|---|---|
| `gofiber/fiber/v2` | HTTP framework | ✅ Implemented (chose over chi for speed + middleware) |
| `gofiber/contrib/websocket` | WebSocket for run streaming | ✅ Implemented |
| `golang-jwt/jwt/v5` | JWT authentication | ✅ Implemented |
| `golang.org/x/crypto` | bcrypt password hashing | ✅ Implemented |
| `google/uuid` | UUID v4 generation | ✅ Implemented |
| `pressly/goose/v3` | Database migrations (embedded) | ✅ Implemented (chose over golang-migrate) |
| `sqlc` | Type-safe SQL query generation | ✅ Implemented |
| `modernc.org/sqlite` | Pure-Go SQLite driver | ✅ Implemented |
| `log/slog` | Structured JSON logging | ✅ Implemented (chose over zap — stdlib is enough) |

### Deferred Libraries

| Library | Purpose | When |
|---|---|---|
| `robfig/cron` | Cron expression parsing | Phase 5 (scheduler) |
| `riverqueue/river` | Background job queue | Phase 5 (scheduler) |
| `pgx` | PostgreSQL driver | Phase 5+ (prod deployment) |

---

## Frontend: Bun + Vite + React

**Why Bun + Vite?** Replaced Next.js in Phase 3 rewrite.
- 122ms dev cold start (vs Next.js ~400ms)
- 1s production build (vs ~4s)
- Pure SPA — no SSR needed, all data from API
- Tailwind v4 with `@tailwindcss/vite` plugin (no PostCSS config)

### Frontend Libraries

| Library | Purpose | Status |
|---|---|---|
| `bun` | Runtime + package manager | ✅ Implemented |
| `vite` (v7) | Build tool + dev server | ✅ Implemented |
| `react` (v19) | UI framework | ✅ Implemented |
| `react-router-dom` (v6) | Client-side routing | ✅ Implemented |
| `shadcn/ui` | Component library (14 components) | ✅ Implemented |
| `tailwindcss` (v4) | Utility-first CSS (dark theme) | ✅ Implemented |
| `@tanstack/react-query` | Server state / data fetching | ✅ Implemented |
| `zustand` | Client auth state management | ✅ Implemented |
| `lucide-react` | Icon set | ✅ Implemented |
| `sonner` | Toast notifications | ✅ Implemented |
| WebSocket (native) | Real-time run streaming | ✅ Implemented |
| `recharts` | Charts for cost tracking | Phase 5+ |

---

## Database

### Development: SQLite
- **Driver**: `modernc.org/sqlite` (pure Go, no CGO)
- **Migrations**: goose with embedded SQL files
- **Queries**: sqlc-generated type-safe Go code
- **File**: `data/platform.db` (auto-created)
- Zero config, zero external dependencies

### Production: PostgreSQL
- Same migrations work on both (ANSI SQL subset)
- Auto-detected from `DATABASE_URL` prefix (`sqlite://` vs `postgres://`)
- Same sqlc queries with PostgreSQL driver

### Schema (3 migrations)

| Table | Migration | Description |
|---|---|---|
| `users` | 001 | User accounts (email, name, bcrypt hash) |
| `api_keys` | 001 + 003 | LLM keys (AES-256-GCM encrypted, base_url) |
| `agents` | 001 | Agent configs (name, prompt, model, YAML) |
| `runs` | 001 | Run records (status, output, metrics) |
| `run_events` | 001 | Event log per run (seq, type, JSON data) |
| `skills` | 002 | Skill registry (name, tier, SKILL.md) |
| `agent_skills` | 002 | Agent ↔ skill linking (ordered) |

---

## API Security

| Layer | Implementation |
|---|---|
| Authentication | JWT HS256 (access 60min + refresh 7 days) |
| Passwords | bcrypt |
| API key storage | AES-256-GCM encryption at rest |
| Rate limiting | Token bucket (10/min auth, 120/min API) |
| Request tracing | X-Request-ID on every response |
| Token types | Access vs refresh enforced (can't use refresh as access) |

---

## Deployment

### Local Development (current)

```bash
# API (SQLite, single binary)
PORT=8080 JWT_SECRET=secret DATABASE_URL=sqlite://data/platform.db ./bin/api

# Web (Next.js dev server)
NEXT_PUBLIC_API_URL=http://localhost:8080 npm run dev
```

### Docker Compose

```yaml
services:
  api:       # Go binary (multi-stage alpine build)
  # Optional:
  # postgres: # PostgreSQL 16
```

Dockerfile and docker-compose.yml included in agent-platform-api.

### Production Cloud (future)

- Go API on Cloud Run / Fly.io / Kubernetes
- PostgreSQL on managed service (Supabase, Neon, RDS)
- Next.js on Vercel or same container
- S3 for run log archival

---

## Development Tooling

| Tool | Purpose | Status |
|---|---|---|
| `make` | Build, test, lint targets | ✅ All repos |
| `sqlc` | Generate Go from SQL | ✅ platform-api |
| `goose` | Run/embed migrations | ✅ platform-api |
| `golangci-lint` | Go linting | ✅ agent-core |
| `eslint` | TypeScript linting | ✅ platform-web |
| `docker compose` | Dev environment | ✅ platform-api |
