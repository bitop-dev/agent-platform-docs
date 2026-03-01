# Agent Platform — Builder Documentation

This directory contains the planning, architecture, and design documentation for the **Agent Platform** — a web-based system for creating, configuring, and running autonomous AI agents.

## Vision

A web portal where users can:
- **Create agents** with a name, persona, and mission/job description
- **Equip agents with skills** from a central skill registry
- **Schedule agents** to run on a cron schedule or trigger manually
- **Monitor agents** in real-time: see logs, status, outputs, and run history
- **Orchestrate multiple agents** for complex multi-step workflows

---

## Document Index

| Document | Description |
|---|---|
| [architecture/overview.md](architecture/overview.md) | System-wide architecture diagram and component map |
| [architecture/agent-core.md](architecture/agent-core.md) | The agent runtime engine |
| [architecture/skill-registry.md](architecture/skill-registry.md) | Skill discovery, storage, and execution |
| [architecture/scheduler.md](architecture/scheduler.md) | Cron-based and event-driven job scheduling |
| [architecture/web-platform.md](architecture/web-platform.md) | Web portal, API, and UI design |
| [architecture/orchestration.md](architecture/orchestration.md) | Multi-agent coordination and workflow |
| [architecture/data-model.md](architecture/data-model.md) | Database schemas and persistence design |
| [tech-stack.md](tech-stack.md) | Language, framework, and dependency decisions |
| [roadmap.md](roadmap.md) | Phased build plan with milestones |
| [reference-projects.md](reference-projects.md) | Analysis of opensrc reference projects |
| [repository-structure.md](repository-structure.md) | Multi-repo boundaries, dependency graph, dev workflow |
| [agent-core-deep-dive.md](agent-core-deep-dive.md) | Comprehensive agent-core design with Go code, CLI, directory structure |
| [agent-core-gaps.md](agent-core-gaps.md) | Gap analysis from second-pass reference project review |
| [skill-registry-deep-dive.md](skill-registry-deep-dive.md) | Skill system gaps from zeroclaw/openclaw analysis; build order |
| [tools-deep-dive.md](tools-deep-dive.md) | Three-tier tool system: core tools, skill tools, MCP; subprocess protocol; sandboxing |
| [skills/README.md](skills/README.md) | Bundled skill reference implementations index |
| [skills/CONTRIBUTING.md](skills/CONTRIBUTING.md) | Community skill submission guide, requirements, PR review process |

---

## Quick Concept Map

```
┌─────────────────────────────────────────────────────────────┐
│                      Web Portal (UI)                        │
│         Create Agents · Assign Skills · View Runs           │
└────────────────────────┬────────────────────────────────────┘
                         │ REST + WebSocket API
┌────────────────────────▼────────────────────────────────────┐
│                    Platform API (Go)                        │
│     Auth · Agent CRUD · Skill Registry · Job Manager       │
└──────┬───────────────────────────────────┬──────────────────┘
       │                                   │
┌──────▼──────────┐               ┌────────▼────────┐
│  Agent Runtime  │               │   Scheduler     │
│  (Agent Core)   │               │  (Cron Engine)  │
│                 │               │                 │
│ · LLM Provider  │               │ · Cron Expr     │
│ · Tool Exec     │               │ · Event Trigger │
│ · Memory/State  │               │ · Run History   │
│ · Skill Load    │               │ · Retry/Backoff │
└──────┬──────────┘               └────────┬────────┘
       │                                   │
┌──────▼───────────────────────────────────▼──────────────────┐
│                     Skill Registry                          │
│    Bundled Skills · Workspace Skills · Community Skills     │
└─────────────────────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────────────┐
│                    Storage Layer                            │
│    SQLite (dev) · PostgreSQL (prod) · Object Store (logs)   │
└─────────────────────────────────────────────────────────────┘
```
