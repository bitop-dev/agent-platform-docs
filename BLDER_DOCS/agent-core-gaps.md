# Agent Core — Gap Analysis

A second-pass review of the reference projects against our current `agent-core-deep-dive.md`. This documents what we missed, what we underspecified, and what we have the timing wrong on.

---

## Things Missing Entirely

### 1. MCP — Model Context Protocol

**Source**: `zeroclaw/src/tools/mcp_client.rs`, `mcp_protocol.rs`, `mcp_tool.rs`, `mcp_transport.rs`

This is the biggest gap. MCP is Anthropic's open standard for connecting external tool servers to agents. It's already the de facto way the ecosystem is shipping integrations. We have zero mention of it.

**What it means**: Instead of every agent needing its own hand-coded tool, any MCP-compatible server can plug in. Databases, code runners, APIs, file systems, browser automation — the community is already shipping MCP servers for all of this. Without MCP support, we're writing individual tool integrations forever.

**How it works**: The agent-core connects to an MCP server (local subprocess or HTTP/SSE) via a simple JSON-RPC handshake, gets back a tool list, and those tools show up in the agent's tool engine like any other tool. The server handles the actual execution.

zeroclaw supports three transports:
- **stdio**: spawn a local process, communicate over stdin/stdout (same pattern as our subprocess tools)
- **HTTP**: connect to a remote MCP HTTP server
- **SSE**: connect to a remote MCP SSE server (streaming)

**What needs to be added**:
```yaml
# In agent YAML config
mcp_servers:
  - name: filesystem
    transport: stdio
    command: ["npx", "@modelcontextprotocol/server-filesystem", "/workspace"]
    timeout_seconds: 30

  - name: github
    transport: sse
    url: "http://localhost:8000/sse"
    timeout_seconds: 60
```

MCP servers register their tools automatically — the agent-core discovers them at startup and treats them as first-class tools.

**Priority**: Phase 1 of agent-core (not later — the ecosystem is moving fast here).

---

### 2. Model Catalog + Cost Tracking

**Source**: `pi-mono/packages/ai/src/models.ts` + `models.generated.ts`, `zeroclaw/src/cost/`

We plan to show `$0.004` in the output but have no plan for how to calculate it. We also have no way to know a model's context window size (needed for compaction) or its capabilities (needed for capability checks) without hardcoding them.

**What pi-mono does**: A generated `models.generated.ts` file with every model's metadata — context window, max output tokens, cost per million input/output/cache tokens, supported features. `calculateCost()` uses this at runtime.

**What zeroclaw does**: A `CostTracker` that accumulates `TokenUsage` records across all LLM calls in a session. Each usage record contains: model, input tokens, output tokens, total tokens, cost_usd, timestamp. The observer's `CostObserver` hooks into the event stream to record this.

**What we need**:
```go
// models.go — embedded in the binary, updated with releases
type ModelSpec struct {
    ID            string
    Provider      string
    ContextWindow int
    MaxOutputTokens int
    InputCostPerM  float64  // USD per million input tokens
    OutputCostPerM float64  // USD per million output tokens
    CacheReadPerM  float64
    CacheWritePerM float64
    Capabilities  ModelCapabilities
}

type ModelCapabilities struct {
    NativeTools    bool
    Vision         bool
    ExtendedThinking bool
    PromptCaching  bool
}

// CostTracker accumulates across the run
type CostTracker struct {
    InputTokens  int
    OutputTokens int
    CacheRead    int
    CacheWrite   int
    TotalCostUSD float64
}
```

This drives: output cost display, context window compaction trigger, capability feature flags.

**Priority**: Phase 1 of agent-core (needed for output renderer and compaction).

---

### 3. Reliable Provider — Retry, Backoff, Key Rotation, Failover

**Source**: `zeroclaw/src/providers/reliable.rs`

We buried "LLM provider failover" in Phase 8 (hardening). That's wrong — this is baseline provider reliability and belongs at the provider layer from day one.

Zeroclaw's `ReliableProvider` wraps N providers with:
- **Retry with exponential backoff** on transient errors (5xx, 429, 408)
- **Immediate fail** on non-retryable errors (4xx except 429/408, auth failures, context window exceeded)
- **API key rotation** on 429 rate-limit errors (round-robin through a list of keys)
- **Model fallback chains**: if `claude-opus-4` fails, try `claude-sonnet-4-5` next
- **Provider fallback**: if Anthropic is down, try OpenAI as backup

The error classification is the critical insight. Without it, a naive retry burns tokens and time on auth errors that will never self-heal:

```go
type ErrorClass string
const (
    ErrorRetryable    ErrorClass = "retryable"    // 5xx, 429, 408, network timeout
    ErrorNonRetryable ErrorClass = "non_retryable" // 4xx (not 429/408), auth, model not found
    ErrorContextFull  ErrorClass = "context_full"  // context window exceeded — compact, don't retry
)

func classifyError(err error) ErrorClass
```

**In our config**:
```yaml
model:
  provider: anthropic
  name: claude-opus-4-5
  api_keys:
    - env: ANTHROPIC_KEY_1
    - env: ANTHROPIC_KEY_2   # rotated on 429
  fallback_models:
    - claude-sonnet-4-5      # tried if opus fails
  retry:
    max_attempts: 3
    base_backoff_ms: 1000
```

**Priority**: Phase 1 of agent-core. You need this before you have reliable agents.

---

### 4. Observer Interface

**Source**: `zeroclaw/src/observability/traits.rs` + the full observer stack

We noted "observer events for metrics" in the zeroclaw description but never designed the interface. Without it you can't monitor the agent, can't plug in Prometheus/OTEL, and can't test properly (tests swap in a recording observer).

Zeroclaw's full stack: `NoopObserver` → `LogObserver` → `PrometheusObserver` → `OtelObserver`, all composable via `MultiObserver`. The `CostObserver` hooks into the event stream to accumulate token costs.

**What we need**:
```go
type Observer interface {
    OnEvent(event ObserverEvent)
}

type ObserverEvent struct {
    Type      ObserverEventType
    Timestamp time.Time

    // LLM call
    Provider      string
    Model         string
    InputTokens   int
    OutputTokens  int
    DurationMS    int64
    Success       bool
    ErrorMsg      string

    // Tool call
    ToolName   string
    ToolDurationMS int64
    ToolSuccess    bool

    // Run lifecycle
    RunID     string
    TurnCount int
    CostUSD   float64
}

// Implementations:
// NoopObserver     — for tests
// LogObserver      — structured log line per event
// CostObserver     — accumulates cost, emits summary at agent_end
// MultiObserver    — fan-out to multiple observers
// (future) OtelObserver, PrometheusObserver
```

**Priority**: Phase 1 of agent-core — use `NoopObserver` in tests, `LogObserver` in dev, wire up later ones as needed.

---

## Things Underspecified

### 5. Context Window Management — How We Know We're Full

We said "compact when 80% full" but never specified how we know how full we are. There are three approaches and we need to pick one:

**Option A: Token counting before each LLM call** — Count tokens using a library (tiktoken-equivalent for Go: `pkoukk/tiktoken-go`), compare against the model's context window from the model catalog. Pro: proactive. Con: adds latency, tokenizer must match the model exactly.

**Option B: Track usage from API responses** — Every LLM response includes `input_tokens` in the usage field. Track this across the conversation. When approaching the limit, compact. Pro: exact, no tokenizer needed. Con: reactive (you only know after the call).

**Option C: Catch context-exceeded errors reactively** — Just send and see. If the provider returns a context window exceeded error, compact and retry. Pro: simple. Con: one wasted failed call per compaction.

**Recommendation**: Option B as primary + Option C as safety net. Track cumulative `input_tokens` from usage responses. When that count approaches the model's `ContextWindow` (from model catalog), trigger compaction before the next call. Option C catches anything that slips through.

---

### 6. Trim Must Respect Tool Message Boundaries

**Source**: `zeroclaw/src/agent/loop_/history.rs`

Our tail-window trim could silently corrupt the conversation by splitting a tool message run. Zeroclaw's code has this exact guard:

```
// Never keep a leading role=tool at the trim boundary.
// Tool-message runs must remain attached to their preceding
// assistant(tool_calls) message.
while trim_end < history.len() && history[trim_end].role == "tool" {
    trim_end += 1;
}
```

If we trim N messages from the front but position N lands mid-way through a tool result block, the LLM will receive an orphaned tool result with no corresponding assistant tool call — most providers reject this. Our trim implementation must include this guard.

---

### 7. Compaction — The Right Algorithm

We said "LLM summarizes older turns." The implementation detail matters. From zeroclaw's `history.rs`:

```
Constants:
  COMPACTION_KEEP_RECENT_MESSAGES = 20   // always preserve last 20
  COMPACTION_MAX_SOURCE_CHARS     = 12,000  // cap what we send to summarizer
  COMPACTION_MAX_SUMMARY_CHARS    = 2,000   // cap the summary itself

Algorithm:
  1. Preserve: system prompt (first message)
  2. Preserve: last 20 non-system messages (recent context)
  3. Compact: everything in between
     a. Build a transcript of the middle section (cap at 12K chars)
     b. Send to LLM: "Summarize this conversation history concisely"
     c. Replace middle section with: "[Compaction summary]\n{summary}"
  4. Never compact if total non-system messages ≤ threshold
```

Key constraint: the compaction call itself uses the same provider/model, so it consumes tokens and takes time. Log it as a `EvtContextCompacted` event so the user knows it happened.

---

### 8. Session Persistence for Chat Mode

**Source**: `zeroclaw/src/agent/session.rs`

For `agent-core chat` interactive mode, we need to decide: does the conversation survive the process exiting? Without persistence, `chat` mode is just a REPL — exit and it's gone.

Zeroclaw offers: in-memory (gone on exit), SQLite (persists). Both respect a TTL and a max message limit.

**For agent-core, we need at minimum**:
- `--session-id` flag: give a session a name (e.g., `--session-id standup`)
- Sessions saved to `~/.agent-core/sessions/{id}.jsonl` by default
- `agent-core chat --session-id standup --resume` loads the prior session
- `agent-core sessions list` / `agent-core sessions clear <id>`

This is the difference between `chat` being a throwaway REPL vs an actual persistent assistant.

**Priority**: Phase 1 of agent-core, alongside the `chat` command.

---

## Timing Corrections

These items were either missing or scheduled too late:

| Item | Old Timing | Corrected Timing | Reason |
|---|---|---|---|
| Provider retry/backoff/failover | Phase 8 (hardening) | Phase 1 (agent-core) | Baseline reliability, not a luxury |
| API key rotation on 429 | Phase 8 | Phase 1 | Same |
| Model catalog (context windows, costs) | Not planned | Phase 1 | Needed for cost display + compaction trigger |
| Cost tracking / CostObserver | Not planned | Phase 1 | Needed for output renderer |
| Observer interface | Not planned | Phase 1 | Needed for testing + future monitoring |
| MCP support | Not planned | Phase 2 (agent-core) | Ecosystem is moving fast; skip it = rewrites later |
| Session persistence for chat | Not planned | Phase 1 | Makes `chat` command actually useful |
| Error classification (retryable vs not) | Not planned | Phase 1 | Without it, retries burn tokens on auth errors |
| Tool message boundary guard in trim | Not planned | Phase 1 | Correctness issue, not optimization |

---

## Things to Add to the Comparison Table

Update the "Key Differences" table in agent-core-deep-dive.md:

| Feature | pi-mono | zeroclaw | openclaw | **Ours** |
|---|---|---|---|---|
| MCP client | No | Yes | No | **Yes (Phase 2)** |
| Model catalog | Yes (generated) | Partial | Partial | **Yes (embedded)** |
| Cost tracking | Yes | Yes | Partial | **Yes** |
| Observer interface | No | Yes (full stack) | No | **Yes (simple → extensible)** |
| Provider retry + backoff | No | Yes | Yes | **Yes** |
| API key rotation | No | Yes | Yes | **Yes** |
| Model fallback chains | No | Yes | Yes | **Yes** |
| Session persistence | No | Yes (SQLite) | Yes | **Yes (JSONL file)** |
| Error classification | No | Yes | Partial | **Yes** |

---

## What Doesn't Change

The core design is sound. These things stay as planned:
- Turn loop algorithm ✓
- Event stream model (from pi-mono) ✓
- Tool interface + Tool Engine ✓
- Subprocess tools ✓
- Loop detection (from zeroclaw) ✓
- Safety heartbeat (from zeroclaw) ✓
- Deferred-action detection (from zeroclaw) ✓
- Credential scrubbing (from zeroclaw) ✓
- Approval manager (from zeroclaw) ✓
- Parallel tool execution ✓
- SKILL.md loader ✓
- Two-stage context pipeline: `transformContext → convertToLlm` ✓
- Builder pattern for Agent ✓
- No global state ✓
