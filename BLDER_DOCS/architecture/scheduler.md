# Scheduler

The Scheduler is responsible for triggering agent runs at the right time. Agents are designed to run unattended — the scheduler is what makes them autonomous.

---

## Trigger Types

| Trigger Type | Description |
|---|---|
| **Manual** | User clicks "Run Now" in the portal |
| **Cron** | Standard cron expression (`0 9 * * 1` = every Monday at 9am) |
| **Every** | Simple interval (`every 1h`, `every 30m`) |
| **One-shot** | Run once at a specific timestamp, then auto-disable |
| **Webhook** | HTTP POST to a unique URL triggers a run |
| **Event** | Internal platform event (e.g., another agent completes) |

---

## Job Record

Each scheduled job is stored in the database:

```go
type ScheduledJob struct {
    ID          string
    AgentID     string
    Name        string
    Description string
    Enabled     bool

    // Schedule
    Schedule    Schedule

    // What to do when triggered
    Payload     JobPayload

    // Delivery: where to send results
    Delivery    *JobDelivery

    // State
    State       JobState

    CreatedAt   time.Time
    UpdatedAt   time.Time
}

type Schedule struct {
    Kind      ScheduleKind  // "cron" | "every" | "at" | "webhook"
    CronExpr  string        // e.g., "0 9 * * 1" (when Kind == cron)
    EveryMs   int64         // milliseconds (when Kind == every)
    At        *time.Time    // specific time (when Kind == at)
    Timezone  string        // e.g., "America/New_York"
    StaggerMs int64         // random jitter window to avoid thundering herd
}

type ScheduleKind string
const (
    ScheduleKindCron    ScheduleKind = "cron"
    ScheduleKindEvery   ScheduleKind = "every"
    ScheduleKindAt      ScheduleKind = "at"
    ScheduleKindWebhook ScheduleKind = "webhook"
    ScheduleKindManual  ScheduleKind = "manual"
)

type JobPayload struct {
    // Optional override mission for this scheduled run
    // If empty, uses the agent's default mission
    Mission string
    // Optional model override
    Model   string
    // Timeout for this specific run
    TimeoutSeconds int
}

type JobDelivery struct {
    Mode    DeliveryMode // "none" | "webhook" | "email" | "slack"
    Target  string       // URL, email, or channel ID
}

type DeliveryMode string
const (
    DeliveryModeNone    DeliveryMode = "none"
    DeliveryModeWebhook DeliveryMode = "webhook"
    DeliveryModeEmail   DeliveryMode = "email"
    DeliveryModeSlack   DeliveryMode = "slack"
)

type JobState struct {
    NextRunAt         *time.Time
    LastRunAt         *time.Time
    LastRunStatus     RunStatus
    LastRunDurationMs int64
    LastError         string
    ConsecutiveErrors int
}
```

---

## Scheduler Engine

The scheduler runs as a background goroutine in the API server (or as a separate service at scale).

### Algorithm

```
On startup:
  Load all enabled jobs from DB
  Compute NextRunAt for each job
  Sort into a min-heap by NextRunAt

Main loop:
  Wait for soonest job's NextRunAt
  
  Fired jobs (NextRunAt <= now):
    Create RunRecord { status: queued, agentID, jobID, payload }
    Enqueue to Run Queue
    Compute new NextRunAt
    Update job.State in DB
    Re-insert into heap
    
  New/updated jobs (via DB watch or in-memory channel):
    Re-compute NextRunAt
    Insert/update in heap
```

### Duplicate Run Prevention

The scheduler must prevent a job from firing again if the previous run is still active:

```go
type RunOverlapPolicy string
const (
    OverlapSkip    RunOverlapPolicy = "skip"    // skip this fire, wait for next
    OverlapQueue   RunOverlapPolicy = "queue"   // queue it, run after current finishes
    OverlapParallel RunOverlapPolicy = "parallel" // run concurrently (default for most jobs)
)
```

**Reference**: `openclaw/src/cron/service.ts` — the cron service has excellent handling for this, including the `service.prevents-duplicate-timers.test.ts` and `service.rearm-timer-when-running.test.ts` test cases.

---

## Run Queue

The Run Queue decouples the scheduler from the agent runtime:

```
Scheduler ──enqueue──► RunQueue ──dequeue──► AgentRunWorker
                          │
                    (persistent, DB-backed)
```

- The queue is backed by the database so runs aren't lost on restart
- Workers poll the queue (or use `LISTEN/NOTIFY` with PostgreSQL)
- Concurrency limit: max N simultaneous runs (configurable, default 5)

For a Go-native queue, consider:
- **Asynq** (Redis-backed): production-ready, good monitoring
- **River** (PostgreSQL-backed): no extra infra, ACID guarantees
- **Custom**: simple `SELECT FOR UPDATE SKIP LOCKED` pattern

---

## Retry Logic

When a run fails:

```go
func retryDelay(consecutiveErrors int) time.Duration {
    // Exponential backoff with jitter
    base := time.Minute * time.Duration(math.Pow(2, float64(consecutiveErrors)))
    jitter := time.Duration(rand.Int63n(int64(30 * time.Second)))
    return min(base+jitter, 4*time.Hour) // cap at 4 hours
}
```

After `maxRetries` (default 3) consecutive failures, the job is auto-disabled and the user is notified.

---

## Catchup Behavior

If the scheduler was down (server restart, deploy), it may have missed scheduled fires.

Policy (configurable per job):
- **`skip`** (default): ignore missed fires, run at next scheduled time
- **`catchup_once`**: fire once immediately for all missed fires as a single run
- **`catchup_all`**: fire once per missed window (careful — can create many runs)

**Reference**: `openclaw/src/cron/service.restart-catchup.test.ts` covers this case thoroughly.

---

## Webhook Triggers

Each job with `Kind == "webhook"` gets a unique secret URL:

```
POST /api/webhooks/trigger/{webhook_secret}
Content-Type: application/json

{
  "mission": "Optional mission override",
  "variables": { "key": "value" }
}
```

The webhook endpoint validates the secret, creates a RunRecord, and enqueues it. Supports HMAC signature verification for production use.

---

## Stagger / Anti-Thundering-Herd

When many agents are scheduled at the same time (e.g., `0 9 * * *` — everyone's daily agent fires at 9am), the scheduler adds a random stagger within the configured `StaggerMs` window. This spreads load across the window rather than spiking all at once.

**Reference**: `openclaw/src/cron/stagger.ts` and `stagger.test.ts`.

---

## Scheduler API Endpoints

```
GET    /api/agents/{agentId}/jobs          List all scheduled jobs
POST   /api/agents/{agentId}/jobs          Create a scheduled job
GET    /api/agents/{agentId}/jobs/{jobId}  Get job details
PUT    /api/agents/{agentId}/jobs/{jobId}  Update job
DELETE /api/agents/{agentId}/jobs/{jobId}  Delete job
POST   /api/agents/{agentId}/jobs/{jobId}/enable   Enable job
POST   /api/agents/{agentId}/jobs/{jobId}/disable  Disable job
POST   /api/agents/{agentId}/jobs/{jobId}/trigger  Run now (manual trigger)
```

---

## Reference Projects

| Project | Relevant Part |
|---|---|
| `openclaw/src/cron/types.ts` | Comprehensive cron job type definitions |
| `openclaw/src/cron/service.ts` | Full scheduler service with stagger, dedup, catchup |
| `openclaw/src/cron/schedule.ts` | Next-run computation for cron/every/at |
| `openclaw/src/cron/store.ts` | Job persistence |
| `gastown/internal/formula/` | Workflow/formula scheduling patterns |
