# Agent Core

The Agent Core is the execution heart of the platform. It manages the conversation loop between the user's mission prompt, the LLM, and any tools the agent calls along the way.

---

## Responsibilities

- Initialize an agent session from config (system prompt, model, skills, history limit)
- Run the **turn loop**: send → receive → execute tools → repeat
- Stream events (text chunks, tool calls, tool results, errors) to the caller
- Enforce limits: max turns, token budget, timeout
- Manage conversation history (truncate/compact when context window fills)

---

## Agent Config

Every agent run starts from a config record pulled from the database:

```go
type AgentConfig struct {
    ID           string
    Name         string
    SystemPrompt string        // Base persona + mission statement
    Model        ModelRef      // e.g., { Provider: "anthropic", Model: "claude-opus-4" }
    Skills       []SkillRef    // Ordered list of skills to load
    MaxTurns     int           // Safety limit on tool-call loops
    TimeoutSec   int           // Hard wall-clock timeout
    HistoryLimit int           // Max messages to keep in context
}

type ModelRef struct {
    Provider string // "anthropic" | "openai" | "google" | "ollama"
    Model    string
    APIKeyID string // ref to encrypted key in DB
}

type SkillRef struct {
    SkillID string
    Version string
}
```

---

## Turn Loop

The core algorithm is a standard agentic loop:

```
Initialize:
  systemPrompt = AgentConfig.SystemPrompt + injected skill context
  messages     = [{ role: "user", content: mission }]

Loop:
  response = LLM.Complete(model, systemPrompt, messages)
  
  if response.hasTextOnly:
      emit TextDone event
      break

  for each toolCall in response.toolCalls:
      emit ToolCallStart event
      result = ToolEngine.Execute(toolCall)
      emit ToolCallEnd event
      messages.append(toolCall, toolResult)

  if turns >= MaxTurns:
      emit MaxTurnsReached event
      break
```

### Events Emitted

The turn loop emits a stream of typed events. These are forwarded to WebSocket clients and stored in the run log:

```go
type RunEvent struct {
    Type      RunEventType
    Timestamp time.Time
    Data      any
}

type RunEventType string

const (
    EventAgentStart    RunEventType = "agent_start"
    EventTurnStart     RunEventType = "turn_start"
    EventTextDelta     RunEventType = "text_delta"
    EventTextEnd       RunEventType = "text_end"
    EventToolCallStart RunEventType = "tool_call_start"
    EventToolCallEnd   RunEventType = "tool_call_end"
    EventAgentEnd      RunEventType = "agent_end"
    EventAgentError    RunEventType = "agent_error"
)
```

---

## LLM Provider Interface

The agent core talks to LLMs through a unified interface so that any provider can be swapped:

```go
type LLMProvider interface {
    Complete(ctx context.Context, req CompletionRequest) (<-chan CompletionEvent, error)
}

type CompletionRequest struct {
    Model        string
    SystemPrompt string
    Messages     []Message
    Tools        []ToolDefinition
    MaxTokens    int
}

type CompletionEvent struct {
    Type    CompletionEventType // text_delta | tool_call | end | error
    Delta   string              // text chunk (streaming)
    ToolCall *ToolCall          // when Type == tool_call
    Error   error
}
```

Planned provider implementations:
- `AnthropicProvider` — Claude models via Anthropic API
- `OpenAIProvider` — GPT-4o, o3, etc.
- `GoogleProvider` — Gemini models
- `OllamaProvider` — local models via Ollama HTTP API

**Reference**: `pi-mono/packages/ai` has a clean multi-provider unified API in TypeScript that we mirror here in Go.

---

## Context / Memory Management

LLMs have finite context windows. The agent core handles this with a pluggable strategy:

```go
type ContextStrategy interface {
    // Called before each LLM call. May truncate/summarize messages.
    Prepare(messages []Message, maxTokens int) ([]Message, error)
}
```

Strategies:
- **TailWindow** (default): keep the most recent N messages
- **SummaryCompaction**: when context is full, call the LLM to summarize older turns, then replace them with the summary
- **VectorRetrieval** (future): embed messages, retrieve relevant ones by similarity

**Reference**: `openclaw/src/gateway/compaction.ts` has a production-grade compaction implementation.

---

## Tool Engine

The Tool Engine is responsible for executing tool calls that the LLM requests. See [tool-engine section of skill-registry.md](skill-registry.md#tool-engine) for full detail.

Short version:
- Tools are registered per-run from the loaded skills
- Each tool has a JSON schema for input validation
- Execution is sandboxed (configurable: process isolation, filesystem scope)
- Tool results are returned as strings (or structured JSON)

---

## Agent Lifecycle States

```
created ──► queued ──► initializing ──► running ──► succeeded
                                           │
                                           ├──► failed
                                           │
                                           └──► timed_out
                                           
Any state ──► cancelled (user action)
```

---

## Error Handling

| Error Type | Behavior |
|---|---|
| LLM API error (transient) | Retry with exponential backoff, up to 3 attempts |
| LLM API error (auth/quota) | Fail immediately, surface to user |
| Tool execution error | Return error result to LLM, let agent decide to retry or stop |
| Max turns exceeded | Emit warning event, save partial output, mark run as `completed_partial` |
| Timeout | Cancel context, save partial output, mark run as `timed_out` |
| Context window full | Trigger compaction strategy before retrying LLM call |

---

## Implementation Notes

- The agent core lives in the `agent-core` repo and is usable as both a standalone binary and an importable Go library (`pkg/agent`) — see [repository-structure.md](../../repository-structure.md)
- The agent core runs inside a Go goroutine per run
- Context cancellation (`context.Context`) threads through all LLM calls and tool executions
- Each run gets a `RunID` used for log storage and WebSocket subscription (when running under `platform-api`)
- For future scalability: runs can be offloaded to a worker pool or separate process via a task queue (e.g., Asynq with Redis)

---

## Reference Projects

| Project | Relevant Part |
|---|---|
| `pi-mono/packages/agent` | Agent turn loop, event model, tool integration (TypeScript reference) |
| `pi-mono/packages/ai` | Multi-provider LLM unified API |
| `openclaw/src/gateway/compaction.ts` | Context compaction strategy |
| `zeroclaw/src/` | Trait-driven provider/tool swap pattern (Rust reference) |
