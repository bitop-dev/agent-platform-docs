# Agent Core — Deep Dive

A thorough analysis of what the agent core needs to be, informed by studying three real production implementations: **pi-mono** (TypeScript), **zeroclaw** (Rust), and **openclaw** (TypeScript). The goal is a **standalone Go binary** that can run agents on its own — no web UI, no database required.

---

## What We Want Out of This

```
# Run an agent from CLI
agent-core run --config myagent.yaml --mission "Summarize today's GitHub issues"

# Interactive mode (REPL)
agent-core chat --config myagent.yaml

# Run from pipe
echo "What is the weather in NYC?" | agent-core run --config myagent.yaml

# List configured tools
agent-core tools --config myagent.yaml

# Validate config  
agent-core validate --config myagent.yaml
```

Output to stdout by default. Streamable. Single binary. Zero external dependencies to run.

---

## Reference Implementations — What Each Teaches Us

### pi-mono (`packages/agent` + `packages/ai`)
**The best event model and loop structure.**
- Clean typed event stream: `agent_start → turn_start → message_start → message_update (streaming) → message_end → tool_execution_start → tool_execution_end → turn_end → agent_end`
- Separate `AgentMessage` (app layer) vs `Message` (LLM layer) — messages can be filtered/transformed before hitting the LLM
- **Steering**: inject user messages mid-run, after tool calls, before next LLM call
- **Follow-up queue**: messages that wait until the agent would otherwise stop, then continue
- `transformContext` → `convertToLlm` pipeline: two-stage context preparation before each LLM call
- `ThinkingLevel`: off / minimal / low / medium / high / xhigh — for models that support extended reasoning
- Tool streaming via `onUpdate` callback (partial results while tool runs)
- Cleanest multi-provider abstraction of the three (15+ providers)

### zeroclaw (`src/agent/agent.rs` + `src/providers/traits.rs`)
**The most production-hardened feature set.**
- **Loop detection**: catches agents stuck in no-progress loops, ping-pong patterns, or repeated failures
- **Safety heartbeat**: re-injects security constraints every N tool iterations — keeps long runs aligned
- **Deferred-action detection**: detects "I'll check X" responses with no tool call, and prompts the agent to either emit the tool call or give a final answer
- **Research phase**: before the main response, run a focused pre-gathering step (reduces hallucinations)
- **Query classification + model routing**: route different query types to different models
- **Credential scrubbing**: strips API keys from tool output before feeding back to LLM
- **Approval manager**: human-in-the-loop gate for dangerous tools (shell, file write, etc.)
- **Parallel tool execution**: when tools don't depend on each other, run concurrently
- Provider **capabilities** declaration: native tool calling, vision — graceful degradation to prompt-guided
- Builder pattern for `Agent` construction
- Observer/telemetry events for metrics

### openclaw (`src/gateway/`)
**The most complete production system.**
- Context compaction: when history fills context window, LLM-summarizes older turns
- Skill loading: SKILL.md injected into system prompt, tools registered
- Tool sandboxing: filesystem scope, network allowlist, subprocess limits
- Sub-agent spawning with depth limits
- Isolated agent sessions (one goroutine/process per run)

---

## Core Concepts for Our Agent Core

### 1. Message Model

Three layers of messages:

```go
// Layer 1: What the LLM sends/receives (wire format)
type Role string
const (
    RoleSystem    Role = "system"
    RoleUser      Role = "user"
    RoleAssistant Role = "assistant"
    RoleToolResult Role = "tool_result"
)

// A content block within a message (text, thinking, tool call, image, tool result)
type ContentBlock interface{ contentBlock() }

type TextBlock struct {
    Text string
}

type ThinkingBlock struct {
    Thinking  string
    Signature string // opaque, passed back to provider for continuity
    Redacted  bool
}

type ToolCallBlock struct {
    ID        string
    Name      string
    Arguments json.RawMessage
}

type ToolResultBlock struct {
    ToolCallID string
    ToolName   string
    Content    string
    IsError    bool
}

type ImageBlock struct {
    Data     []byte
    MimeType string
}

// Layer 2: Message in the conversation history
type Message struct {
    ID        string    // unique per message
    Role      Role
    Content   []ContentBlock
    Timestamp time.Time

    // Only for assistant messages
    Model       string
    Provider    string
    StopReason  StopReason
    Usage       *Usage
    ErrorMsg    string
}

// Layer 3: Run-level event (what subscribers see)
type RunEvent struct {
    Type      RunEventType
    Seq       int           // monotonic sequence number
    Timestamp time.Time
    Data      RunEventData  // union type per event kind
}
```

### 2. Turn Loop

The canonical algorithm — nothing clever, just correct:

```
LOOP:
  [optional] transformContext(history) → pruned history
  convertToLLM(pruned history) → LLM messages
  stream = provider.Complete(model, systemPrompt, llmMessages, tools)

  for chunk in stream:
    emit TextDelta / ThinkingDelta / ToolCallDelta events

  if response.HasToolCalls():
    for toolCall in response.ToolCalls:
      emit ToolCallStart
      result = toolEngine.Execute(toolCall)     ← may run in parallel
      emit ToolCallEnd
      history.Append(toolCall, result)

    [check steering queue — if messages, inject + continue]
    [check loop detector — warn or hard stop]
    [check safety heartbeat — inject if due]
    GOTO LOOP

  else:
    [check follow-up queue — if messages, inject + continue]
    emit AgentEnd
    DONE
```

### 3. Provider Interface

```go
// The single interface all LLM providers implement
type Provider interface {
    // Name for logging/config
    Name() string

    // Capabilities declaration — providers return what they actually support
    Capabilities() ProviderCapabilities

    // Stream a completion. Returns a channel of events.
    // The caller reads until EventDone or EventError.
    Complete(ctx context.Context, req CompletionRequest) (<-chan CompletionEvent, error)
}

type ProviderCapabilities struct {
    NativeToolCalling bool   // false → tools injected as prompt text
    Vision            bool   // false → image inputs rejected
    ExtendedThinking  bool   // false → ThinkingLevel ignored
    Streaming         bool   // false → response delivered all at once
}

type CompletionRequest struct {
    Model        string
    SystemPrompt string
    Messages     []LLMMessage    // LLM-format messages (no AgentMessage layer)
    Tools        []ToolSpec      // if nil or empty, no tools offered
    MaxTokens    int
    Temperature  float64
    Thinking     ThinkingLevel   // "off" | "minimal" | "low" | "medium" | "high"
    APIKey       string          // resolved per-call (supports rotating keys)
    StreamOptions
}

type CompletionEvent struct {
    Type CompletionEventType
    // one of:
    TextDelta    string
    ThinkingDelta string
    ToolCall     *ToolCallBlock  // complete tool call (not streamed in parts for simplicity)
    Usage        *Usage
    Error        error
}

type CompletionEventType string
const (
    CompEventText     CompletionEventType = "text_delta"
    CompEventThinking CompletionEventType = "thinking_delta"
    CompEventToolCall CompletionEventType = "tool_call"
    CompEventDone     CompletionEventType = "done"
    CompEventError    CompletionEventType = "error"
)

type ThinkingLevel string
const (
    ThinkingOff     ThinkingLevel = "off"
    ThinkingMinimal ThinkingLevel = "minimal"
    ThinkingLow     ThinkingLevel = "low"
    ThinkingMedium  ThinkingLevel = "medium"
    ThinkingHigh    ThinkingLevel = "high"
)
```

**Prompt-guided fallback**: When `Capabilities().NativeToolCalling == false`, the tool engine automatically renders tools as text in the system prompt and parses XML-tagged tool calls from the response. Same as zeroclaw's `PromptGuided` payload.

### 4. Tool Interface

```go
type Tool interface {
    Name() string
    Description() string
    // JSON Schema for the parameters object
    ParametersSchema() json.RawMessage
    // Execute the tool. Return content blocks (text or image).
    Execute(ctx context.Context, input json.RawMessage) (ToolResult, error)
}

type ToolResult struct {
    Content []ContentBlock  // returned to LLM (text, images)
    Details any             // stored in run log, not sent to LLM
    IsError bool
}

type ToolSpec struct {
    Name        string          `json:"name"`
    Description string          `json:"description"`
    Parameters  json.RawMessage `json:"parameters"` // JSON Schema
}

// ToolEngine manages registration and execution
type ToolEngine struct {
    tools       map[string]Tool
    policy      SandboxPolicy
    parallelMax int   // max concurrent tool executions
}

func (e *ToolEngine) Register(t Tool)
func (e *ToolEngine) ExecuteAll(ctx context.Context, calls []ToolCallBlock) ([]ToolResult, error)
func (e *ToolEngine) Specs() []ToolSpec
```

### 5. Run Event Stream

Everything the agent does is expressed as a typed event. The caller subscribes and decides what to do (print to stdout, save to file, send over WebSocket, etc.):

```go
type RunEventType string
const (
    EvtAgentStart        RunEventType = "agent_start"
    EvtTurnStart         RunEventType = "turn_start"
    EvtMessageStart      RunEventType = "message_start"
    EvtTextDelta         RunEventType = "text_delta"
    EvtThinkingDelta     RunEventType = "thinking_delta"
    EvtMessageEnd        RunEventType = "message_end"
    EvtToolCallStart     RunEventType = "tool_call_start"
    EvtToolCallEnd       RunEventType = "tool_call_end"
    EvtTurnEnd           RunEventType = "turn_end"
    EvtContextCompacted  RunEventType = "context_compacted"
    EvtLoopWarning       RunEventType = "loop_warning"
    EvtAgentEnd          RunEventType = "agent_end"
    EvtAgentError        RunEventType = "agent_error"
)

type RunEvent struct {
    Type      RunEventType `json:"type"`
    Seq       int          `json:"seq"`
    Timestamp time.Time    `json:"ts"`

    // Text events
    Delta string `json:"delta,omitempty"`

    // Tool events
    ToolName  string          `json:"tool_name,omitempty"`
    ToolInput json.RawMessage `json:"tool_input,omitempty"`
    ToolOutput string         `json:"tool_output,omitempty"`
    IsError   bool            `json:"is_error,omitempty"`

    // End event
    FinalText string  `json:"final_text,omitempty"`
    Usage     *Usage  `json:"usage,omitempty"`
    Error     string  `json:"error,omitempty"`
}

// Caller receives events via channel or callback
type EventHandler func(event RunEvent)
```

---

## Key Features from Reference Projects to Include

### Loop Detection (from zeroclaw)

Prevents runaway agents that repeat the same failing tool calls.

```go
type LoopDetector struct {
    // Detect: no meaningful progress across N turns
    NoProgressThreshold int
    // Detect: ping-pong (A→B→A→B tool sequence)
    PingPongCycles int
    // Detect: same tool failing repeatedly
    FailureStreakThreshold int

    history []toolCallRecord
}

type DetectionVerdict int
const (
    VerdictContinue     DetectionVerdict = iota
    VerdictInjectWarning  // inject a warning message, let agent self-correct
    VerdictHardStop       // bail out with error
)

func (d *LoopDetector) Record(toolName, argHash, output string, success bool)
func (d *LoopDetector) Check() (DetectionVerdict, string)
```

### Deferred-Action Detection (from zeroclaw)

Catches the common failure mode where an agent says "I'll check X now" but emits no tool call.

```go
// After a response with no tool calls, check if the text implies
// an action was supposed to happen. If yes, inject a correction prompt.
func looksLikeDeferredAction(text string) bool
// "Let me check the weather..." → true (no tool call → inject retry prompt)
// "The weather in NYC is 72°F." → false (actual answer)
```

### Safety Heartbeat (from zeroclaw)

Every N tool iterations, re-inject the system constraints as a user message. Keeps long-running agents from "forgetting" their boundaries:

```go
type HeartbeatConfig struct {
    Enabled  bool
    Interval int    // inject every N iterations
    Body     string // pre-rendered constraint text
}
```

### Context Compaction (from openclaw)

When the conversation history approaches the context window limit, summarize older turns:

```go
type ContextStrategy interface {
    // Called before each LLM call with current messages and token estimate.
    // Returns prepared messages (may be trimmed/summarized).
    Prepare(ctx context.Context, messages []Message, tokenBudget int) ([]Message, error)
}

// Strategies:
// TailWindow:   keep last N messages (default, fast)
// Compaction:   LLM-summarizes older turns, replaces with summary
// SlidingWindow: token-budget based trim from the front
```

### Approval Manager (from zeroclaw)

Human-in-the-loop gate for dangerous tools. For the standalone binary this is CLI-based:

```go
type ApprovalPolicy string
const (
    ApprovalNever  ApprovalPolicy = "never"   // always approve
    ApprovalAlways ApprovalPolicy = "always"  // always ask
    ApprovalOnce   ApprovalPolicy = "once"    // ask once per session per tool
    ApprovalList   ApprovalPolicy = "list"    // ask for tools in a specific list
)

type ApprovalManager struct {
    Policy          ApprovalPolicy
    RequiredTools   []string   // which tools need approval (when policy == "list")
    approvedSession map[string]bool // tools approved this session
}

// In CLI mode: prints the tool call and args, waits for y/n
func (a *ApprovalManager) RequestApproval(toolName string, input json.RawMessage) bool
```

### Credential Scrubbing (from zeroclaw)

Strip credentials from tool output before it reaches the LLM context:

```go
// Replace patterns like:
//   api_key: "sk-abc123..." → api_key: "sk-a*[REDACTED]"
//   TOKEN=abc123...         → TOKEN=abc*[REDACTED]
func ScrubCredentials(toolOutput string) string
```

---

## Agent Configuration (YAML)

The standalone binary is driven entirely by a YAML config file:

```yaml
# myagent.yaml
name: "Daily Standup Bot"
description: "Generates a standup summary from GitHub issues"

# LLM settings
model:
  provider: anthropic          # anthropic | openai | google | ollama
  name: claude-sonnet-4-5     # model ID
  api_keys:                    # one or more — rotated on 429 rate-limit errors
    - env: ANTHROPIC_API_KEY
    - env: ANTHROPIC_API_KEY_2
  fallback_models:             # tried in order if primary model fails
    - claude-haiku-4-5
  thinking: off                # off | minimal | low | medium | high
  temperature: 0.7
  max_tokens: 4096
  retry:
    max_attempts: 3
    base_backoff_ms: 1000

# System prompt / persona
system_prompt: |
  You are a technical project manager.
  Your job is to summarize the current state of work from GitHub issues.
  Be concise and focus on blockers and progress.

# Default mission (used when none provided via CLI)
default_mission: |
  Summarize open GitHub issues for today's standup.
  Group by: in-progress, blocked, recently closed.

# Skills loaded before the agent runs
skills:
  - path: ./skills/github/SKILL.md     # local skill
  - path: ./skills/summarize/SKILL.md

# Tools available to the agent
tools:
  # Built-in tools
  - name: bash
    enabled: true
    config:
      allowed_paths: ["./workspace"]
      timeout_seconds: 30

  - name: http_request
    enabled: true
    config:
      allowed_hosts: ["api.github.com"]

  # External tool (subprocess)
  - name: github_issues
    type: subprocess
    command: "./tools/github_issues.sh"
    description: "List GitHub issues for a repository"
    parameters_schema: |
      {
        "type": "object",
        "properties": {
          "repo": { "type": "string" },
          "state": { "type": "string", "enum": ["open", "closed", "all"] }
        },
        "required": ["repo"]
      }

# MCP servers (Model Context Protocol — external tool servers)
mcp_servers:
  - name: filesystem
    transport: stdio
    command: ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    timeout_seconds: 30
  - name: github-mcp
    transport: sse
    url: "http://localhost:8000/sse"
    timeout_seconds: 60

# Runtime limits
  max_turns: 20
  timeout_seconds: 300
  max_tokens_total: 50000

# Context management
context:
  strategy: tail_window        # tail_window | compaction | sliding_window
  tail_window_size: 40         # messages to keep (tail_window)
  compaction_threshold: 0.8    # compact when context is 80% full

# Loop detection
loop_detection:
  no_progress_threshold: 5
  ping_pong_cycles: 3
  failure_streak_threshold: 4

# Safety heartbeat
heartbeat:
  enabled: false
  interval: 10   # every 10 tool iterations

# Tool approval
approval:
  policy: list              # never | always | once | list
  required_tools: [bash]    # prompt before running bash

# Output
output:
  stream: true              # stream text as it arrives
  format: text              # text | json | jsonl
  thinking: false           # show thinking blocks in output
  color: auto               # auto | always | never
  log_file: ""              # save run events to JSONL file
```

---

## Standalone Binary — CLI Design

```
agent-core [command] [flags]

Commands:
  run          Run an agent with a mission (non-interactive)
  chat         Interactive multi-turn chat with an agent
  tools        List tools configured for an agent
  mcp          MCP server management (list, test)
  sessions     Session management (list, show, clear)
  models       List available models and their costs
  validate     Validate agent config file
  providers    List available LLM providers
  version      Show version info

Flags (run + chat):
  --config, -c   Path to agent YAML config (default: ./agent.yaml)
  --mission, -m  Mission override (for 'run' command)
  --model        Model override (provider/model-name)
  --format       Output format: text | json | jsonl
  --no-stream    Disable streaming, output all at once
  --no-color     Disable color output
  --log          Path to save run events as JSONL
  --max-turns    Override max turns limit
  --thinking     Thinking level: off | minimal | low | medium | high
  --timeout      Run timeout in seconds
  --env-file     Load environment variables from .env file
  --quiet, -q    Suppress all output except final answer
  --verbose, -v  Show tool calls, thinking, events
```

### Output Modes

**`--format text`** (default — for humans):
```
╭──────────────────────────────────────────────╮
│  Agent: Daily Standup Bot                    │
│  Model: claude-sonnet-4-5  Mission: standup  │
╰──────────────────────────────────────────────╯

🔧 github_issues(repo="org/app", state="open")
   └─ 12 issues returned (2.1s)

🔧 github_issues(repo="org/app", state="closed")  
   └─ 4 issues closed this week (1.8s)

Here's your standup summary for today:

**In Progress**
- #142 Fix payment flow timeout (assigned: alice)
...

✓ Done  |  2 tools  |  1,247 tokens  |  $0.004  |  18.3s
```

**`--format jsonl`** (for machines / piping to another tool):
```jsonl
{"type":"agent_start","seq":0,"ts":"2026-02-28T14:00:00Z"}
{"type":"tool_call_start","seq":1,"ts":"...","tool_name":"github_issues","tool_input":{"repo":"org/app"}}
{"type":"tool_call_end","seq":2,"ts":"...","tool_name":"github_issues","tool_output":"12 issues..."}
{"type":"text_delta","seq":3,"ts":"...","delta":"Here's your standup"}
{"type":"text_delta","seq":4,"ts":"...","delta":" summary for today:\n"}
{"type":"agent_end","seq":10,"ts":"...","final_text":"...","usage":{"input":847,"output":400}}
```

**`--format json`** (single JSON object at the end, useful for scripting):
```json
{
  "status": "succeeded",
  "output": "Here's your standup summary...",
  "tool_calls": [{"name": "github_issues", "input": {...}, "output": "..."}],
  "usage": {"input": 847, "output": 400, "cost_usd": 0.004},
  "duration_ms": 18300
}
```

---

## External Tools via Subprocess

For the standalone binary, tools that aren't built-in are run as subprocesses. This is the simplest, most language-agnostic extension point:

```
Tool call → agent-core spawns process → process reads JSON from stdin → writes JSON to stdout
```

### Tool subprocess contract

**stdin** (what agent-core sends):
```json
{
  "tool_call_id": "tc_001",
  "name": "github_issues",
  "arguments": { "repo": "org/app", "state": "open" }
}
```

**stdout** (what the tool returns):
```json
{
  "content": "Found 12 open issues:\n#142 Fix payment...",
  "is_error": false
}
```

Or for errors:
```json
{
  "content": "Error: repository not found",
  "is_error": true
}
```

This allows tools to be written in any language — bash, Python, Go, whatever. A bash tool is as simple as:

```bash
#!/bin/bash
INPUT=$(cat)
REPO=$(echo "$INPUT" | jq -r '.arguments.repo')
STATE=$(echo "$INPUT" | jq -r '.arguments.state // "open"')
RESULT=$(gh issue list --repo "$REPO" --state "$STATE" --json number,title,assignees)
echo "{\"content\": $(echo "$RESULT" | jq -Rs .), \"is_error\": false}"
```

---

## Directory Structure for Standalone Binary

This lives in its own repo — `github.com/[org]/agent-core`. See [repository-structure.md](repository-structure.md) for the full multi-repo breakdown.

```
agent-core/
├── cmd/
│   └── agent-core/
│       └── main.go            # CLI entrypoint (cobra)
├── internal/
│   ├── agent/
│   │   ├── agent.go           # Agent struct + builder
│   │   ├── loop.go            # Turn loop
│   │   ├── events.go          # RunEvent types + emitter
│   │   ├── context.go         # Context strategies (tail, compact)
│   │   ├── detection.go       # Loop detection
│   │   ├── approval.go        # Approval manager
│   │   └── scrub.go           # Credential scrubbing
│   ├── provider/
│   │   ├── provider.go        # Provider interface + capabilities
│   │   ├── reliable.go        # ReliableProvider: retry, backoff, key rotation, fallback
│   │   ├── anthropic.go       # Anthropic Claude implementation
│   │   ├── openai.go          # OpenAI implementation
│   │   ├── google.go          # Google Gemini implementation
│   │   ├── ollama.go          # Ollama (local) implementation
│   │   └── registry.go        # Provider registry (name → factory)
│   ├── tool/
│   │   ├── tool.go            # Tool interface + ToolEngine
│   │   ├── builtin/
│   │   │   ├── bash.go        # Built-in bash tool
│   │   │   ├── http.go        # Built-in HTTP request tool
│   │   │   ├── file.go        # Built-in file read/write tools
│   │   │   └── web_search.go  # Built-in web search
│   │   ├── subprocess.go      # Subprocess tool runner (stdin/stdout JSON)
│   │   └── sandbox.go         # Sandbox policy (paths, network, timeout)
│   ├── mcp/
│   │   ├── client.go          # MCP client (connect, handshake, tool list)
│   │   ├── transport_stdio.go # stdio transport (spawn local process)
│   │   ├── transport_http.go  # HTTP transport
│   │   ├── transport_sse.go   # SSE transport (streaming)
│   │   └── tool_adapter.go    # MCP tool → Tool interface adapter
│   ├── models/
│   │   ├── catalog.go         # Model registry (context windows, costs, capabilities)
│   │   └── cost.go            # CostTracker — accumulates USD cost across a run
│   ├── observer/
│   │   ├── observer.go        # Observer interface + ObserverEvent types
│   │   ├── noop.go            # NoopObserver (for tests)
│   │   ├── log.go             # LogObserver (structured log per event)
│   │   ├── cost.go            # CostObserver (hooks into events, tracks USD)
│   │   └── multi.go           # MultiObserver (fan-out to N observers)
│   ├── session/
│   │   ├── session.go         # Session type (ID, messages, metadata)
│   │   └── store.go           # JSONL-backed session persistence
│   ├── skill/
│   │   ├── skill.go           # Skill type + loader
│   │   └── loader.go          # Load SKILL.md, inject into system prompt
│   ├── config/
│   │   ├── config.go          # AgentConfig + YAML parsing
│   │   └── validate.go        # Config validation
│   └── output/
│       ├── output.go          # Output interface
│       ├── text.go            # Colored text renderer
│       ├── json.go            # JSON/JSONL event writer
│       └── quiet.go           # Quiet mode (final answer only)
├── skills/                    # Bundled skill packages
│   ├── github/SKILL.md
│   ├── web_search/SKILL.md
│   └── summarize/SKILL.md
├── examples/
│   ├── standup-bot.yaml       # Example agent config
│   ├── code-reviewer.yaml
│   └── news-summarizer.yaml
└── go.mod
```

---

## Provider Implementation Priority

Build in this order — each adds more capability:

| Priority | Provider | Why |
|---|---|---|
| 1 | **Anthropic** | Claude models. Best tool use, extended thinking, prompt caching. Most popular choice. |
| 2 | **OpenAI** | GPT-4o, o3. Huge user base. Responses API (newer, better) vs Completions API. |
| 3 | **Ollama** | Local models. Zero cost, offline, privacy. Great for testing. |
| 4 | **Google** | Gemini. Long context, multimodal. Growing usage. |
| 5 | **OpenAI-compatible** | Groq, Together, OpenRouter, etc. One implementation covers many providers. |

---

## Built-in Tool Priority

Build in this order:

| Priority | Tool | Rationale |
|---|---|---|
| 1 | `bash` | Most flexible. Run any command. Essential for coding/devops agents. |
| 2 | `http_request` | Call any API. Enables most integration use cases. |
| 3 | `file_read` / `file_write` | Read/write local files. Needed for almost any useful agent. |
| 4 | `web_search` | Search the web (via SerpAPI/Brave/DDG). Very common agent need. |
| 5 | `web_fetch` | Fetch and extract content from URLs. |

---

## Go-Specific Implementation Notes

### Streaming via channels
```go
// Provider returns an event channel
func (p *AnthropicProvider) Complete(ctx context.Context, req CompletionRequest) (<-chan CompletionEvent, error) {
    ch := make(chan CompletionEvent, 32)
    go func() {
        defer close(ch)
        // ... stream from Anthropic API, push events
    }()
    return ch, nil
}
```

### Context cancellation everywhere
```go
// All blocking operations take context.Context
// Caller can cancel with timeout or Ctrl+C
ctx, cancel := context.WithTimeout(context.Background(), cfg.TimeoutSeconds*time.Second)
defer cancel()

// Signal handling
sigCh := make(chan os.Signal, 1)
signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
go func() {
    <-sigCh
    cancel() // propagates to agent loop, provider calls, tool executions
}()
```

### Builder pattern for Agent
```go
agent, err := agent.NewBuilder().
    WithConfig(cfg).
    WithProvider(anthropicProvider).
    WithTools(bashTool, httpTool, fileTool).
    WithSkills(githubSkill, summarizeSkill).
    WithEventHandler(output.TextRenderer(os.Stdout)).
    Build()
```

### No global state — everything passed explicitly
- No package-level singletons
- Config, provider, tools, event handler all injected at construction
- Easy to test: mock any dependency

---

## Key Differences from the Reference Projects

> See [agent-core-gaps.md](agent-core-gaps.md) for the full gap analysis that produced this updated table.

| Feature | pi-mono | zeroclaw | openclaw | **Ours** |
|---|---|---|---|---|
| Language | TypeScript | Rust | TypeScript | **Go** |
| Standalone binary | No (library) | Yes (CLI) | No (daemon) | **Yes** |
| Web UI | No | No | Yes | **No (for core)** |
| Database | No | Optional | Yes | **No (optional JSONL log)** |
| Scheduler | No | Yes | Yes | **No (for core)** |
| Skills | No | Yes | Yes | **Yes** |
| Memory | No | Yes (SQLite) | Yes | **Session-scoped (JSONL persist)** |
| Loop detection | No | Yes | No | **Yes** |
| Safety heartbeat | No | Yes | No | **Yes** |
| Deferred-action detection | No | Yes | No | **Yes** |
| Research phase | No | Yes | No | **Later** |
| Approval (human-in-loop) | No | Yes | No | **Yes (CLI)** |
| Credential scrubbing | No | Yes | No | **Yes** |
| Context compaction | No | Yes | Full | **Yes (tail + LLM-summarize)** |
| Multi-provider | 15+ | 10+ | 10+ | **5 (prioritized)** |
| Parallel tools | Yes | Yes | No | **Yes** |
| Subprocess tools | No | No | No | **Yes** |
| **MCP client** | No | Yes | No | **Yes (Phase 2)** |
| **Model catalog** | Yes (generated) | Partial | Partial | **Yes (embedded)** |
| **Cost tracking** | Yes | Yes | Partial | **Yes** |
| **Observer interface** | No | Yes (full stack) | No | **Yes** |
| **Provider retry + backoff** | No | Yes | Yes | **Yes** |
| **API key rotation** | No | Yes | Yes | **Yes** |
| **Model fallback chains** | No | Yes | Yes | **Yes** |
| **Session persistence** | No | Yes (SQLite) | Yes | **Yes (JSONL file)** |
| **Error classification** | No | Yes | Partial | **Yes** |

---

## What We're NOT Building in the Core

Keep it focused. These belong in the platform layer (later):

- ❌ Persistent memory across sessions (SQLite / vector DB)
- ❌ Scheduling / cron
- ❌ Web UI or API server
- ❌ Multi-agent orchestration (spawning sub-agents)
- ❌ User authentication
- ❌ Run history database

The core does one thing well: **take a config, take a mission, run an agent, emit events, produce an answer**.

---

## Build Order (Updated — see agent-core-gaps.md for rationale)

**Week 1 — Core runtime:**
1. Project scaffolding (Go module, cobra CLI, viper config)
2. `AgentConfig` YAML schema + loader + validator
3. `Observer` interface + `NoopObserver` + `LogObserver` (needed early for testability)
4. Model catalog (embedded Go file: context windows, costs, capabilities per model)
5. `Provider` interface + Anthropic implementation (streaming)
6. `ReliableProvider` wrapper: retry/backoff, error classification, API key rotation
7. Minimal turn loop (no tool calling yet — LLM → text output)
8. Text output renderer (streaming to stdout with cost tracking)
9. `agent-core run` command works end-to-end

**Week 2 — Tools, skills, session:**
10. `Tool` interface + `ToolEngine` with parallel execution
11. Built-in tools: `bash`, `http_request`, `file_read`, `file_write`
12. Subprocess tool runner (external tools via stdin/stdout JSON)
13. Tool sandboxing: path scope, network allowlist, timeout
14. Tool calling in the loop (native + prompt-guided fallback, tool message boundary guard)
15. Skill loader (SKILL.md → system prompt injection)
16. Session persistence (JSONL file, `--session-id` flag)
17. `agent-core chat` interactive mode with session resume
18. JSON/JSONL output formats
19. OpenAI provider + `ReliableProvider` model fallback chains

**Week 3 — Robustness:**
20. Context compaction: tail-window trim (with tool boundary guard) + LLM-summarize
21. Context window tracking (from usage tokens + model catalog)
22. Loop detection (no-progress, ping-pong, failure streak)
23. Deferred-action detection + retry prompt
24. Safety heartbeat
25. Credential scrubbing from tool output
26. Approval manager (CLI prompts for dangerous tools)
27. Ollama provider + Google provider
28. `CostObserver` — accumulates cost across run, logs at agent_end
29. Run log file (append events as JSONL)
30. Config validation with helpful error messages
31. Example agent configs in `examples/`

**Week 4 — MCP:**
32. MCP client: stdio transport (spawn local process, JSON-RPC handshake)
33. MCP client: HTTP + SSE transports
34. MCP tool adapter: discovered tools → `Tool` interface
35. MCP config in YAML (`mcp_servers:` list)
36. `agent-core mcp list` command (show available tools from configured servers)
37. `pkg/agent` public API finalized for `platform-api` import
