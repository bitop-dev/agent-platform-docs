# Web Platform

The web platform is the user's primary interface for creating, managing, and monitoring agents. It is a full-stack web application with a React/Next.js frontend and the Go API server as its backend.

---

## Tech Stack Choice

| Layer | Choice | Rationale |
|---|---|---|
| Frontend Framework | **Next.js (App Router)** | SSR for fast initial load, API routes for BFF pattern, familiar ecosystem |
| UI Library | **shadcn/ui + Tailwind** | Composable, accessible, easy to customize |
| State Management | **Zustand + React Query** | Server state via React Query, client state via Zustand |
| Real-time | **WebSocket** (native) | Run output streaming, live status updates |
| API Client | **Generated from OpenAPI** | Type-safe, auto-generated from Go server spec |
| Backend | **Go (net/http + chi)** | Consistent with the rest of the platform |
| Auth | **JWT + refresh tokens** | Stateless, scalable; OAuth providers as Phase 2 |

---

## Application Pages / Routes

### Agent Management

| Route | Description |
|---|---|
| `/` | Dashboard — recent runs, active agents, quick stats |
| `/agents` | List all agents |
| `/agents/new` | Create new agent (wizard) |
| `/agents/{id}` | Agent detail — overview, runs, settings |
| `/agents/{id}/edit` | Edit agent config |
| `/agents/{id}/runs` | Run history for this agent |
| `/agents/{id}/runs/{runId}` | Single run detail / live streaming view |
| `/agents/{id}/schedule` | Manage scheduled jobs |

### Skill Hub

| Route | Description |
|---|---|
| `/skills` | Browse all available skills (bundled + workspace + community) |
| `/skills/{id}` | Skill detail — description, tools, which agents use it |
| `/skills/new` | Create a workspace skill |
| `/skills/{id}/edit` | Edit a workspace skill |

### Settings

| Route | Description |
|---|---|
| `/settings` | User/team settings |
| `/settings/api-keys` | LLM provider API keys management |
| `/settings/webhooks` | Incoming webhook management |

---

## Key UI Components

### Agent Builder

A multi-step form for creating an agent:

```
Step 1: Identity
  · Name (required)
  · Description / purpose
  · Avatar (emoji or image upload)

Step 2: Mission
  · System Prompt editor (rich markdown editor)
  · "Mission" field — the default task the agent runs each time
  · Model selector (provider + model dropdown)

Step 3: Skills
  · Skill picker (searchable list of available skills)
  · Drag-to-reorder (order affects system prompt injection order)
  · Per-skill config (if skill supports it)

Step 4: Schedule
  · Toggle: manual only | cron | every | one-shot
  · Cron expression builder (visual + raw input)
  · Timezone selector
  · Delivery: where to send results (none | webhook | email)

Step 5: Review & Create
  · Summary of all settings
  · "Test Run" button — triggers a run immediately
  · "Create Agent" button
```

### Run Monitor

The live view of an agent run. Key features:
- **Streaming text**: token-by-token output as the agent responds
- **Tool call accordion**: collapsible panels showing each tool call's name, inputs, and outputs
- **Timeline**: visual timeline of events (LLM thinking, tool calls, response)
- **Stats bar**: live token count, elapsed time, estimated cost
- **Stop button**: cancel a running agent
- **Download log**: export full run log as JSON or text

```
┌──────────────────────────────────────────────────────┐
│  🤖 Agent: Daily Standup Bot   ● Running  [Stop]    │
│  Started: 2m 14s ago | Tokens: 1,247 | ~$0.004      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  I'll check the GitHub issues for today's standup.  │
│                                                      │
│  ▼ Tool: github_list_issues                         │
│    Input: { "repo": "org/app", "state": "open" }   │
│    Output: [12 issues returned]               ✓     │
│                                                      │
│  Based on the open issues, here is the standup      │
│  summary for today:                                 │
│                                                      │
│  **In Progress**                                    │
│  - #142: Fix payment flow timeout ← [in progress]   │
│  - #138: Update API docs...                         │
│                                    [streaming...]   │
└──────────────────────────────────────────────────────┘
```

### Skill Hub Browser

A card-based browser similar to an app store:
- Filter by tier (bundled / workspace / community)
- Filter by tags (code, data, communication, productivity...)
- Search by name or description
- Each card shows: icon, name, description, tool count, which agents use it
- "Install" / "Remove" / "Edit" actions

---

## API Design

The platform exposes a RESTful JSON API. WebSocket for streaming.

### REST Endpoints

```
# Agents
GET    /api/v1/agents
POST   /api/v1/agents
GET    /api/v1/agents/:id
PUT    /api/v1/agents/:id
DELETE /api/v1/agents/:id

# Runs
GET    /api/v1/agents/:id/runs
POST   /api/v1/agents/:id/runs        (trigger manual run)
GET    /api/v1/runs/:runId
DELETE /api/v1/runs/:runId            (cancel)

# Scheduled Jobs
GET    /api/v1/agents/:id/jobs
POST   /api/v1/agents/:id/jobs
GET    /api/v1/jobs/:jobId
PUT    /api/v1/jobs/:jobId
DELETE /api/v1/jobs/:jobId
POST   /api/v1/jobs/:jobId/trigger

# Skills
GET    /api/v1/skills
POST   /api/v1/skills
GET    /api/v1/skills/:id
PUT    /api/v1/skills/:id
DELETE /api/v1/skills/:id
POST   /api/v1/skills/install         (from URL)

# Auth
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh
GET    /api/v1/auth/me

# API Keys (LLM providers)
GET    /api/v1/settings/api-keys
POST   /api/v1/settings/api-keys
DELETE /api/v1/settings/api-keys/:id

# Webhooks
GET    /api/webhooks/trigger/:secret   (incoming webhook trigger)
```

### WebSocket: Run Streaming

```
WS /api/v1/runs/:runId/stream
```

The server streams `RunEvent` objects as newline-delimited JSON:

```json
{"type":"agent_start","timestamp":"2026-02-28T14:00:00Z"}
{"type":"text_delta","timestamp":"...","data":{"delta":"I'll check"}}
{"type":"text_delta","timestamp":"...","data":{"delta":" the GitHub"}}
{"type":"tool_call_start","timestamp":"...","data":{"name":"github_list_issues","input":{...}}}
{"type":"tool_call_end","timestamp":"...","data":{"name":"github_list_issues","result":"..."}}
{"type":"text_delta","timestamp":"...","data":{"delta":"Based on..."}}
{"type":"agent_end","timestamp":"...","data":{"status":"succeeded","usage":{...}}}
```

The frontend subscribes on page load and renders events in real time.

---

## Authentication & Multi-User

### Phase 1 (MVP): Single-user / self-hosted
- Simple username/password auth
- JWT access token (15 min) + refresh token (7 days)
- All data belongs to one user

### Phase 2: Multi-user / Teams
- User accounts with email verification
- Teams with role-based access (Admin, Editor, Viewer)
- Agents and skills are scoped to a team
- OAuth providers: GitHub, Google

### API Key Security
- LLM provider API keys are stored **encrypted at rest** (AES-256-GCM)
- The encryption key is stored in an environment variable or secrets manager
- Keys are never returned to the client after creation (only `****` masked display)

---

## Reference Projects

| Project | Relevant Part |
|---|---|
| `openclaw` | Web UI (Control UI, Canvas host) for a real agent platform |
| `pi-mono/packages/web-ui` | React components for AI chat interfaces |
| `gastown/internal/dashboard/` | Go web dashboard serving pattern |
| `openclaw/src/channel-web.ts` | WebSocket-based channel for real-time agent output |
