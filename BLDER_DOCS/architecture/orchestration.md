# Multi-Agent Orchestration

While a single agent handles most use cases, some missions benefit from — or require — multiple agents working together. Orchestration is the layer that coordinates this.

---

## When Do You Need Orchestration?

| Scenario | Solution |
|---|---|
| Task is too large for one context window | Split into sub-tasks, spawn child agents |
| Parallel work (search + analyze + report simultaneously) | Fan-out to parallel agents |
| Specialized work (research agent → writing agent → review agent) | Sequential pipeline |
| Long-running autonomous work with checkpoints | Convoy / workflow pattern |
| Peer review / validation | Agent A does work, Agent B reviews |

---

## Orchestration Patterns

### 1. Supervisor + Workers (Recommended for MVP)

One "orchestrator agent" breaks down the mission, spawns workers, collects results.

```
Mission: "Write a weekly market analysis report"

Orchestrator
├── Worker A: "Research tech sector news (last 7 days)"
├── Worker B: "Research macro economic indicators"  
├── Worker C: "Summarize earnings reports: AAPL, GOOG, MSFT"
└── [all complete]
    └── Worker D: "Compile results from A, B, C into executive report"
```

The orchestrator uses the `agent_spawn` tool to create workers:

```json
{
  "tool": "agent_spawn",
  "input": {
    "mission": "Research tech sector news from the last 7 days",
    "skills": ["web_search", "summarize"],
    "model": "claude-haiku-4",
    "timeout_seconds": 120
  }
}
```

### 2. Sequential Pipeline

Agents run in a defined sequence, passing output as input to the next:

```
[Data Collector] → [Analyzer] → [Report Writer] → [Reviewer]
```

Defined as a Workflow config:

```go
type Workflow struct {
    ID    string
    Name  string
    Steps []WorkflowStep
}

type WorkflowStep struct {
    AgentID     string
    Name        string
    // Input template — can reference {previous.output}
    MissionTemplate string
    // Whether to run this step only if previous step produced output
    ConditionOnPrevious bool
}
```

### 3. Fan-Out / Fan-In

Run N agents in parallel over a list of items, collect all results:

```
Input: [item1, item2, item3, item4, item5]

Fan-out → Agent(item1), Agent(item2), Agent(item3), Agent(item4), Agent(item5)
                                                                      ↓
Fan-in ← Aggregator Agent receives all 5 results, produces final output
```

---

## `agent_spawn` Tool

This is the key primitive for orchestration. Any agent with this skill can create and wait for sub-agents.

```go
// Tool Definition
ToolDefinition{
    Name:        "agent_spawn",
    Description: "Spawn a sub-agent to complete a specific task. The spawned agent runs asynchronously. Returns when the sub-agent completes.",
    InputSchema: json.RawMessage(`{
        "type": "object",
        "properties": {
            "mission":          { "type": "string", "description": "The task for the sub-agent" },
            "skills":           { "type": "array", "items": { "type": "string" }, "description": "Skill IDs to give the sub-agent" },
            "model":            { "type": "string", "description": "Model override (optional)" },
            "timeout_seconds":  { "type": "integer", "description": "Max seconds to wait (default 300)" },
            "wait":             { "type": "boolean", "description": "Whether to wait for completion (default true)" }
        },
        "required": ["mission"]
    }`),
}
```

**Depth limits**: Sub-agents are limited to a max spawn depth (default 3) to prevent infinite recursion. This matches the pattern in `openclaw/src/gateway/openclaw-tools.subagents.sessions-spawn-depth-limits.test.ts`.

---

## Sub-Agent Registry

When a parent spawns child agents, the platform tracks the relationship:

```go
type SubAgentRecord struct {
    RunID        string    // The child run's ID
    ParentRunID  string    // The parent run's ID
    Depth        int       // 1 = direct child of root agent
    Mission      string
    Status       RunStatus
    StartedAt    time.Time
    CompletedAt  *time.Time
    Output       string    // Final text output from child
}
```

The Run Monitor shows this as a tree:

```
Run #1234 (parent)
├── Sub-agent #1235: Research tech news ✓
├── Sub-agent #1236: Research macro data ✓ 
└── Sub-agent #1237: Compile report... ● running
```

**Reference**: `openclaw/src/gateway/subagent-registry.ts` has a full implementation.

---

## Convoy / Workflow Orchestration (Phase 2)

Inspired by **gastown's convoy pattern**, a Workflow is a multi-step process with defined dependencies between steps:

```go
type Workflow struct {
    ID          string
    Name        string
    Description string
    Steps       []WorkflowStep
    CreatedBy   string
    CreatedAt   time.Time
}

type WorkflowStep struct {
    ID              string
    WorkflowID      string
    Name            string
    AgentID         string          // Which agent template to use
    MissionTemplate string          // Go template, can use outputs from prior steps
    DependsOn       []string        // Step IDs that must complete first
    Status          WorkflowStepStatus
}

type WorkflowStepStatus string
const (
    StepPending   WorkflowStepStatus = "pending"
    StepRunning   WorkflowStepStatus = "running"
    StepSucceeded WorkflowStepStatus = "succeeded"
    StepFailed    WorkflowStepStatus = "failed"
    StepSkipped   WorkflowStepStatus = "skipped"
)
```

The Workflow Engine:
1. Identifies steps with no pending dependencies → runs them in parallel
2. As steps complete, checks what was unblocked → kicks off next steps
3. Tracks the full DAG of step dependencies

**Reference**: `gastown` whole convoy + beads + formula system. `gastown/internal/formula/formulas/` has TOML-defined workflow templates.

---

## Handoff / Context Passing

When one agent's output becomes the next agent's input, the platform handles context passing:

```
Step 1 output: "Here are 12 key market trends..."
                          ↓
Step 2 mission template:
  "Given this market research:
   {{steps.step1.output}}
   
   Write an executive summary for a board presentation."
```

Template variables available in `MissionTemplate`:
- `{{steps.<stepId>.output}}` — text output of a completed step
- `{{job.variables.<key>}}` — workflow-level input variables
- `{{now}}` — current timestamp

---

## Failure Handling in Workflows

| Failure Mode | Behavior |
|---|---|
| One step fails, others don't depend on it | Workflow continues, failed step marked |
| One step fails, dependents can't run | Dependents are `skipped`, workflow ends |
| Step timeout | Same as failure |
| Retry on failure | Configurable per step: `maxRetries: 2` |

---

## Observability

The Run Monitor for workflows shows:
- Visual DAG of steps (boxes with arrows)
- Color coding: pending (gray), running (blue pulse), succeeded (green), failed (red), skipped (yellow)
- Click any step to see its full run log
- Overall workflow timeline

---

## Reference Projects

| Project | Relevant Part |
|---|---|
| `gastown` | Full multi-agent orchestration: Mayor/Polecat/Convoy/Hook pattern |
| `gastown/internal/formula/` | TOML workflow formula templates |
| `openclaw/src/gateway/subagent-registry.ts` | Sub-agent lifecycle tracking |
| `openclaw/src/gateway/openclaw-tools.ts` | `sessions_spawn` tool — agent spawning primitive |
| `openclaw/src/gateway/subagent-depth.ts` | Depth limit enforcement |
