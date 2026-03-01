# Data Model

All persistent platform state lives in a relational database (PostgreSQL for production, SQLite for local dev). This document defines the core schemas.

---

## Entity Relationship Overview

```
users ──< team_members >── teams
                                │
                     ┌──────────┴──────────┐
                     │                     │
                   agents               skills
                     │                     │
              ┌──────┴──────┐              │
              │             │              │
        scheduled_jobs    agent_skills >───┘
              │
           runs
              │
        ┌─────┴──────┐
        │            │
    run_events   sub_runs
```

---

## Table Definitions

### `users`

```sql
CREATE TABLE users (
    id          TEXT PRIMARY KEY,   -- UUID
    email       TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    password_hash TEXT,             -- null if OAuth-only
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `api_keys` (LLM Provider Keys)

```sql
CREATE TABLE api_keys (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider    TEXT NOT NULL,      -- "anthropic" | "openai" | "google" | "ollama"
    label       TEXT NOT NULL,      -- Display name e.g. "My Anthropic Key"
    key_enc     BYTEA NOT NULL,     -- AES-256-GCM encrypted key
    key_hint    TEXT NOT NULL,      -- Last 4 chars: "...sk9x"
    is_default  BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `agents`

```sql
CREATE TABLE agents (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    avatar          TEXT,               -- emoji or image URL
    system_prompt   TEXT NOT NULL,      -- Base persona/instructions
    default_mission TEXT NOT NULL,      -- Default task when triggered
    model_provider  TEXT NOT NULL,      -- "anthropic" | "openai" | "google" | "ollama"
    model_name      TEXT NOT NULL,      -- e.g. "claude-opus-4-20260101"
    api_key_id      TEXT REFERENCES api_keys(id),
    max_turns       INTEGER NOT NULL DEFAULT 20,
    timeout_seconds INTEGER NOT NULL DEFAULT 300,
    history_limit   INTEGER NOT NULL DEFAULT 50,
    enabled         BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `skills`

```sql
CREATE TABLE skills (
    id              TEXT PRIMARY KEY,
    user_id         TEXT REFERENCES users(id),   -- NULL = bundled/system skill
    name            TEXT NOT NULL,
    description     TEXT NOT NULL,
    tier            TEXT NOT NULL,               -- "bundled" | "workspace" | "community"
    version         TEXT NOT NULL DEFAULT '1.0.0',
    skill_md        TEXT NOT NULL,               -- The SKILL.md content
    tools_json      JSONB NOT NULL DEFAULT '[]', -- Array of ToolDefinition
    tags            TEXT[] NOT NULL DEFAULT '{}',
    source_url      TEXT,                        -- Origin URL if community skill
    enabled         BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(id, version)
);
```

### `agent_skills`

The join table linking agents to their skills, with ordering:

```sql
CREATE TABLE agent_skills (
    agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    skill_id    TEXT NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
    skill_version TEXT NOT NULL DEFAULT 'latest',
    position    INTEGER NOT NULL DEFAULT 0,  -- injection order
    config_json JSONB,                       -- per-skill config overrides
    PRIMARY KEY (agent_id, skill_id)
);
```

### `scheduled_jobs`

```sql
CREATE TABLE scheduled_jobs (
    id              TEXT PRIMARY KEY,
    agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    enabled         BOOLEAN NOT NULL DEFAULT true,
    
    -- Schedule
    schedule_kind   TEXT NOT NULL,  -- "cron" | "every" | "at" | "webhook" | "manual"
    cron_expr       TEXT,
    every_ms        BIGINT,
    run_at          TIMESTAMPTZ,
    timezone        TEXT NOT NULL DEFAULT 'UTC',
    stagger_ms      BIGINT NOT NULL DEFAULT 0,
    overlap_policy  TEXT NOT NULL DEFAULT 'skip',  -- "skip" | "queue" | "parallel"
    catchup_policy  TEXT NOT NULL DEFAULT 'skip',  -- "skip" | "catchup_once"
    
    -- Payload overrides
    mission_override TEXT,
    model_override   TEXT,
    timeout_seconds  INTEGER,
    
    -- Delivery
    delivery_mode   TEXT NOT NULL DEFAULT 'none',  -- "none" | "webhook" | "email"
    delivery_target TEXT,
    
    -- State
    next_run_at     TIMESTAMPTZ,
    last_run_at     TIMESTAMPTZ,
    last_run_status TEXT,
    last_error      TEXT,
    consecutive_errors INTEGER NOT NULL DEFAULT 0,
    
    -- Webhook trigger
    webhook_secret  TEXT UNIQUE,    -- Only set if schedule_kind = 'webhook'
    
    delete_after_run BOOLEAN NOT NULL DEFAULT false,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `runs`

The core record for every agent execution:

```sql
CREATE TABLE runs (
    id              TEXT PRIMARY KEY,
    agent_id        TEXT NOT NULL REFERENCES agents(id),
    job_id          TEXT REFERENCES scheduled_jobs(id),
    parent_run_id   TEXT REFERENCES runs(id),   -- for sub-agents
    depth           INTEGER NOT NULL DEFAULT 0,
    
    -- What was executed
    mission         TEXT NOT NULL,              -- Actual mission used
    model_provider  TEXT NOT NULL,
    model_name      TEXT NOT NULL,
    skills_snapshot JSONB NOT NULL DEFAULT '[]', -- Snapshot of skills at run time
    
    -- Status
    status          TEXT NOT NULL DEFAULT 'queued', -- queued|running|succeeded|failed|timed_out|cancelled
    
    -- Results
    output_text     TEXT,                       -- Final text output from agent
    error_message   TEXT,
    
    -- Metrics
    total_turns     INTEGER,
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    cache_read_tokens INTEGER,
    cost_usd        DECIMAL(10, 6),
    duration_ms     BIGINT,
    
    queued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_runs_agent_id ON runs(agent_id);
CREATE INDEX idx_runs_parent_run_id ON runs(parent_run_id);
CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_runs_queued_at ON runs(queued_at DESC);
```

### `run_events`

Granular event log for a run (enables replay and detailed monitoring):

```sql
CREATE TABLE run_events (
    id          BIGSERIAL PRIMARY KEY,
    run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    seq         INTEGER NOT NULL,       -- sequence number within the run
    event_type  TEXT NOT NULL,          -- text_delta | tool_call_start | tool_call_end | etc.
    data_json   JSONB,                  -- event-specific data
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_run_events_run_id ON run_events(run_id, seq);
```

> **Storage consideration**: For high-volume deployments, run_events can be moved to an append-only log (ClickHouse, TimescaleDB, or object storage) to keep PostgreSQL lean. For MVP, it stays in the main DB.

---

## Key Indexes

```sql
-- Fast lookup of agent's recent runs
CREATE INDEX idx_runs_agent_status ON runs(agent_id, status, queued_at DESC);

-- Scheduler: find jobs due to run
CREATE INDEX idx_jobs_next_run ON scheduled_jobs(next_run_at) 
    WHERE enabled = true AND next_run_at IS NOT NULL;

-- Skills by tier for skill hub browsing  
CREATE INDEX idx_skills_tier_enabled ON skills(tier, enabled);

-- Webhook trigger lookup
CREATE INDEX idx_jobs_webhook_secret ON scheduled_jobs(webhook_secret)
    WHERE webhook_secret IS NOT NULL;
```

---

## Migrations

Using **golang-migrate** or **goose** for schema migrations:

```
migrations/
  000001_initial_schema.up.sql
  000001_initial_schema.down.sql
  000002_add_workflows.up.sql
  000002_add_workflows.down.sql
  ...
```

---

## Future Tables (Phase 2+)

| Table | Purpose |
|---|---|
| `teams` | Multi-user team groupings |
| `team_members` | user ↔ team membership + roles |
| `workflows` | Multi-step workflow definitions |
| `workflow_steps` | Individual steps in a workflow |
| `workflow_runs` | Execution records for workflows |
| `agent_memory` | Persistent key-value memory per agent |
| `skill_ratings` | Community skill ratings/reviews |
| `audit_log` | Compliance audit trail for all mutations |
