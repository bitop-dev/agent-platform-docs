#!/usr/bin/env node
// Generates .excalidraw diagram files for the agent platform docs.
// Run: node generate.js
// Output: *.excalidraw files in this directory — open with https://excalidraw.com

import { writeFileSync } from "fs";

// ─── Helpers ─────────────────────────────────────────────────────────────────

let idCounter = 1;
const uid = () => `el-${idCounter++}`;
const seed = () => Math.floor(Math.random() * 999999);

const COLORS = {
  blue:       { bg: "#a5d8ff", stroke: "#1971c2" },
  green:      { bg: "#b2f2bb", stroke: "#2f9e44" },
  purple:     { bg: "#d0bfff", stroke: "#7048e8" },
  orange:     { bg: "#ffd8a8", stroke: "#e8590c" },
  yellow:     { bg: "#ffec99", stroke: "#e67700" },
  pink:       { bg: "#fcc2d7", stroke: "#c2255c" },
  gray:       { bg: "#dee2e6", stroke: "#495057" },
  teal:       { bg: "#99e9f2", stroke: "#0c8599" },
  white:      { bg: "#ffffff", stroke: "#1e1e1e" },
  dark:       { bg: "#343a40", stroke: "#1e1e1e" },
};

function rect({ id, x, y, w, h, label, color = "white", fontSize = 16, bold = false, radius = true, subLabel }) {
  const rectId = id || uid();
  const textId = uid();
  const c = COLORS[color];
  const elements = [];

  elements.push({
    id: rectId,
    type: "rectangle",
    x, y, width: w, height: h,
    angle: 0,
    strokeColor: c.stroke,
    backgroundColor: c.bg,
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: radius ? { type: 3 } : null,
    seed: seed(),
    version: 1, versionNonce: seed(),
    isDeleted: false,
    boundElements: [{ id: textId, type: "text" }],
    updated: Date.now(), link: null, locked: false,
  });

  const textContent = subLabel ? `${label}\n${subLabel}` : label;
  const lineCount = textContent.split("\n").length;
  const lineH = fontSize * 1.25;

  elements.push({
    id: textId,
    type: "text",
    x: x + 8, y: y + (h - lineCount * lineH) / 2,
    width: w - 16, height: lineCount * lineH,
    angle: 0,
    strokeColor: c.stroke,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1, strokeStyle: "solid",
    roughness: 1, opacity: 100,
    groupIds: [], frameId: null, roundness: null,
    seed: seed(), version: 1, versionNonce: seed(),
    isDeleted: false, boundElements: [],
    updated: Date.now(), link: null, locked: false,
    text: textContent,
    fontSize,
    fontFamily: 1,
    textAlign: "center",
    verticalAlign: "middle",
    baseline: fontSize,
    containerId: rectId,
    originalText: textContent,
    lineHeight: 1.25,
    ...(bold ? { fontWeight: "bold" } : {}),
  });

  return { elements, id: rectId };
}

function arrow({ from, to, label, fromSide = "bottom", toSide = "top", color = "#1e1e1e", dash = false }) {
  const arrowId = uid();
  const elements = [];

  elements.push({
    id: arrowId,
    type: "arrow",
    x: from.x, y: from.y,
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
    angle: 0,
    strokeColor: color,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: dash ? "dashed" : "solid",
    roughness: 1, opacity: 100,
    groupIds: [], frameId: null,
    roundness: { type: 2 },
    seed: seed(), version: 1, versionNonce: seed(),
    isDeleted: false, boundElements: [],
    updated: Date.now(), link: null, locked: false,
    points: [[0, 0], [to.x - from.x, to.y - from.y]],
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: "arrow",
  });

  if (label) {
    const textId = uid();
    elements.push({
      id: textId,
      type: "text",
      x: (from.x + to.x) / 2 - 60,
      y: (from.y + to.y) / 2 - 12,
      width: 120, height: 24,
      angle: 0,
      strokeColor: "#555",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1, strokeStyle: "solid",
      roughness: 1, opacity: 100,
      groupIds: [], frameId: null, roundness: null,
      seed: seed(), version: 1, versionNonce: seed(),
      isDeleted: false, boundElements: [],
      updated: Date.now(), link: null, locked: false,
      text: label, fontSize: 12, fontFamily: 1,
      textAlign: "center", verticalAlign: "middle",
      baseline: 12, containerId: null,
      originalText: label, lineHeight: 1.25,
    });
  }

  return { elements, id: arrowId };
}

function label({ x, y, w = 200, text, fontSize = 13, color = "#555", bold = false }) {
  const id = uid();
  return {
    elements: [{
      id, type: "text",
      x, y, width: w, height: fontSize * 1.5,
      angle: 0,
      strokeColor: color,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1, strokeStyle: "solid",
      roughness: 1, opacity: 100,
      groupIds: [], frameId: null, roundness: null,
      seed: seed(), version: 1, versionNonce: seed(),
      isDeleted: false, boundElements: [],
      updated: Date.now(), link: null, locked: false,
      text, fontSize, fontFamily: 1,
      textAlign: "center", verticalAlign: "middle",
      baseline: fontSize, containerId: null,
      originalText: text, lineHeight: 1.25,
    }],
    id,
  };
}

function excalidraw(elements) {
  return JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements,
    appState: {
      gridSize: 20,
      viewBackgroundColor: "#f8f9fa",
    },
    files: {},
  }, null, 2);
}

function collect(...things) {
  return things.flatMap(t => Array.isArray(t) ? t.flatMap(x => x.elements) : t.elements);
}

// ─── Diagram 1: System Architecture Overview ─────────────────────────────────

function diagramSystemArchitecture() {
  idCounter = 1;
  const all = [];

  // Web Portal (top center)
  const web = rect({ x: 400, y: 40, w: 300, h: 70, label: "platform-web\n(Next.js Portal)", color: "blue" });
  all.push(...web.elements);

  // Platform API (middle center)
  const api = rect({ x: 400, y: 180, w: 300, h: 70, label: "platform-api\n(Go API Server)", color: "green" });
  all.push(...api.elements);

  // Agent Core (left)
  const core = rect({ x: 60, y: 320, w: 280, h: 70, label: "agent-core\n(Go binary + pkg/agent)", color: "purple" });
  all.push(...core.elements);

  // Scheduler (right)
  const sched = rect({ x: 760, y: 320, w: 240, h: 70, label: "Scheduler\n(cron engine)", color: "orange" });
  all.push(...sched.elements);

  // Skills repo (bottom center)
  const skills = rect({ x: 400, y: 320, w: 280, h: 70, label: "skills repo\n(community registry)", color: "teal" });
  all.push(...skills.elements);

  // Storage (bottom center)
  const storage = rect({ x: 400, y: 460, w: 280, h: 70, label: "Storage\n(PostgreSQL + object store)", color: "gray" });
  all.push(...storage.elements);

  // LLM Providers (far left)
  const llm = rect({ x: 60, y: 460, w: 280, h: 70, label: "LLM Providers\n(Anthropic · OpenAI · Ollama · Google)", color: "yellow" });
  all.push(...llm.elements);

  // MCP Servers (far right)
  const mcp = rect({ x: 760, y: 460, w: 240, h: 70, label: "MCP Servers\n(external tool servers)", color: "pink" });
  all.push(...mcp.elements);

  // Arrows
  // web → api (REST + WebSocket)
  all.push(...arrow({ from: { x: 550, y: 110 }, to: { x: 550, y: 180 }, label: "REST + WS" }).elements);

  // api → core
  all.push(...arrow({ from: { x: 460, y: 250 }, to: { x: 220, y: 320 }, label: "imports pkg/agent" }).elements);

  // api → scheduler
  all.push(...arrow({ from: { x: 640, y: 250 }, to: { x: 840, y: 320 }, label: "manages jobs" }).elements);

  // api → storage
  all.push(...arrow({ from: { x: 550, y: 390 }, to: { x: 550, y: 460 } }).elements);

  // core → llm
  all.push(...arrow({ from: { x: 200, y: 390 }, to: { x: 200, y: 460 }, label: "streaming API" }).elements);

  // core → skills
  all.push(...arrow({ from: { x: 340, y: 355 }, to: { x: 400, y: 355 }, label: "installs / loads" }).elements);

  // core → mcp
  all.push(...arrow({ from: { x: 340, y: 370 }, to: { x: 760, y: 480 }, dash: true, label: "MCP (phase 2)" }).elements);

  // scheduler → core
  all.push(...arrow({ from: { x: 760, y: 355 }, to: { x: 340, y: 355 } }).elements);

  return excalidraw(all);
}

// ─── Diagram 2: Tool Tier System ─────────────────────────────────────────────

function diagramToolTiers() {
  idCounter = 1;
  const all = [];

  // Title
  all.push(...label({ x: 200, y: 20, w: 700, text: "Three-Tier Tool System", fontSize: 20, color: "#1e1e1e", bold: true }).elements);

  // LLM box (top)
  const llm = rect({ x: 350, y: 70, w: 300, h: 60, label: "LLM (Claude / GPT / Gemini)", color: "yellow" });
  all.push(...llm.elements);

  // ToolEngine box
  const engine = rect({ x: 350, y: 200, w: 300, h: 60, label: "ToolEngine\n(dispatch + parallel exec)", color: "gray" });
  all.push(...engine.elements);

  // Arrow LLM → engine
  all.push(...arrow({ from: { x: 500, y: 130 }, to: { x: 500, y: 200 }, label: "tool_call" }).elements);
  all.push(...arrow({ from: { x: 500, y: 200 }, to: { x: 500, y: 130 }, label: "result" }).elements);

  // Tier 1: Core tools
  const core = rect({ x: 60, y: 340, w: 260, h: 200, label: "", color: "purple" });
  all.push(...core.elements);
  all.push(...label({ x: 80, y: 350, w: 220, text: "① Core Tools", fontSize: 15, color: "#7048e8", bold: true }).elements);
  all.push(...label({ x: 80, y: 378, w: 220, text: "bash  (opt-out)", fontSize: 12, color: "#495057" }).elements);
  all.push(...label({ x: 80, y: 398, w: 220, text: "read_file · write_file · edit_file", fontSize: 12, color: "#495057" }).elements);
  all.push(...label({ x: 80, y: 418, w: 220, text: "list_dir · grep · http_fetch", fontSize: 12, color: "#495057" }).elements);
  all.push(...label({ x: 80, y: 448, w: 220, text: "Compiled into binary.", fontSize: 11, color: "#7048e8" }).elements);
  all.push(...label({ x: 80, y: 466, w: 220, text: "In-process. Always available.", fontSize: 11, color: "#7048e8" }).elements);
  all.push(...label({ x: 80, y: 486, w: 220, text: "No install needed.", fontSize: 11, color: "#7048e8" }).elements);

  // Tier 2: Skill tools
  const skillBox = rect({ x: 370, y: 340, w: 260, h: 200, label: "", color: "teal" });
  all.push(...skillBox.elements);
  all.push(...label({ x: 390, y: 350, w: 220, text: "② Skill Tools", fontSize: 15, color: "#0c8599", bold: true }).elements);
  all.push(...label({ x: 390, y: 378, w: 220, text: "web_search · web_fetch", fontSize: 12, color: "#495057" }).elements);
  all.push(...label({ x: 390, y: 398, w: 220, text: "github · slack · notion", fontSize: 12, color: "#495057" }).elements);
  all.push(...label({ x: 390, y: 418, w: 220, text: "send_email · ...", fontSize: 12, color: "#495057" }).elements);
  all.push(...label({ x: 390, y: 448, w: 220, text: "Subprocess (stdin/stdout JSON).", fontSize: 11, color: "#0c8599" }).elements);
  all.push(...label({ x: 390, y: 466, w: 220, text: "Any language: bash, Python, Go.", fontSize: 11, color: "#0c8599" }).elements);
  all.push(...label({ x: 390, y: 486, w: 220, text: "Installed via skill registry.", fontSize: 11, color: "#0c8599" }).elements);

  // Tier 3: MCP tools
  const mcpBox = rect({ x: 680, y: 340, w: 260, h: 200, label: "", color: "orange" });
  all.push(...mcpBox.elements);
  all.push(...label({ x: 700, y: 350, w: 220, text: "③ MCP Tools", fontSize: 15, color: "#e8590c", bold: true }).elements);
  all.push(...label({ x: 700, y: 378, w: 220, text: "PostgreSQL · filesystem", fontSize: 12, color: "#495057" }).elements);
  all.push(...label({ x: 700, y: 398, w: 220, text: "Playwright browser", fontSize: 12, color: "#495057" }).elements);
  all.push(...label({ x: 700, y: 418, w: 220, text: "custom remote servers", fontSize: 12, color: "#495057" }).elements);
  all.push(...label({ x: 700, y: 448, w: 220, text: "External server (stdio / SSE).", fontSize: 11, color: "#e8590c" }).elements);
  all.push(...label({ x: 700, y: 466, w: 220, text: "Persistent connection.", fontSize: 11, color: "#e8590c" }).elements);
  all.push(...label({ x: 700, y: 486, w: 220, text: "Phase 2.", fontSize: 11, color: "#e8590c" }).elements);

  // Arrows from engine to each tier
  all.push(...arrow({ from: { x: 430, y: 260 }, to: { x: 190, y: 340 } }).elements);
  all.push(...arrow({ from: { x: 500, y: 260 }, to: { x: 500, y: 340 } }).elements);
  all.push(...arrow({ from: { x: 570, y: 260 }, to: { x: 810, y: 340 } }).elements);

  return excalidraw(all);
}

// ─── Diagram 3: Agent Turn Loop ───────────────────────────────────────────────

function diagramTurnLoop() {
  idCounter = 1;
  const all = [];

  all.push(...label({ x: 150, y: 20, w: 400, text: "Agent Turn Loop", fontSize: 20, color: "#1e1e1e", bold: true }).elements);

  // Flow: vertical, centered at x=350
  const cx = 350;
  const bw = 260, bh = 54;

  const start    = rect({ x: cx - bw/2, y:  70, w: bw, h: bh, label: "START\nReceive mission / user message", color: "green" });
  const context  = rect({ x: cx - bw/2, y: 180, w: bw, h: bh, label: "Build context\n(system prompt + skills + history)", color: "blue" });
  const llmCall  = rect({ x: cx - bw/2, y: 290, w: bw, h: bh, label: "LLM call\n(streaming response)", color: "purple" });
  const hasTools = rect({ x: cx - bw/2, y: 400, w: bw, h: bh, label: "Tool calls in response?", color: "yellow", radius: false });
  const execTools = rect({ x: cx - bw/2, y: 510, w: bw, h: bh, label: "Execute tools\n(parallel, sandboxed)", color: "teal" });
  const limitCheck = rect({ x: cx - bw/2, y: 620, w: bw, h: bh, label: "Check limits\n(turns · tokens · loops)", color: "yellow", radius: false });
  const compact  = rect({ x: cx + 200, y: 620, w: 220, h: bh, label: "Compact history\n(LLM summarize)", color: "orange" });
  const done     = rect({ x: cx - bw/2, y: 730, w: bw, h: bh, label: "DONE\nEmit agent_end event", color: "green" });

  for (const b of [start, context, llmCall, hasTools, execTools, limitCheck, compact, done]) {
    all.push(...b.elements);
  }

  // Arrows
  all.push(...arrow({ from: { x: cx, y: 124 }, to: { x: cx, y: 180 } }).elements);
  all.push(...arrow({ from: { x: cx, y: 234 }, to: { x: cx, y: 290 } }).elements);
  all.push(...arrow({ from: { x: cx, y: 344 }, to: { x: cx, y: 400 } }).elements);

  // Yes → execute tools
  all.push(...arrow({ from: { x: cx, y: 454 }, to: { x: cx, y: 510 }, label: "Yes" }).elements);
  // tools → limit check
  all.push(...arrow({ from: { x: cx, y: 564 }, to: { x: cx, y: 620 } }).elements);

  // No (text response) → done
  all.push(...arrow({ from: { x: cx + bw/2, y: 427 }, to: { x: cx + bw/2 + 80, y: 757 }, label: "No" }).elements);

  // limit check: over limit → compact
  all.push(...arrow({ from: { x: cx + bw/2, y: 647 }, to: { x: cx + 200, y: 647 }, label: "context full" }).elements);
  // compact → back to context
  all.push(...arrow({ from: { x: cx + 200, y: 620 }, to: { x: cx + 480, y: 207 }, label: "retry" }).elements);

  // limit check: max turns → done
  all.push(...arrow({ from: { x: cx, y: 674 }, to: { x: cx, y: 730 }, label: "ok / max turns" }).elements);

  // loop back from tool results to context
  all.push(...arrow({ from: { x: cx - bw/2, y: 537 }, to: { x: cx - bw/2 - 80, y: 207 }, label: "append results" }).elements);

  return excalidraw(all);
}

// ─── Diagram 4: Skill Loading Flow ────────────────────────────────────────────

function diagramSkillLoading() {
  idCounter = 1;
  const all = [];

  all.push(...label({ x: 100, y: 20, w: 700, text: "Skill Loading Flow", fontSize: 20, color: "#1e1e1e", bold: true }).elements);

  // Left column: disk / install
  const diskTitle = label({ x: 60, y: 70, w: 220, text: "Skill Sources", fontSize: 14, color: "#7048e8", bold: true });
  all.push(...diskTitle.elements);

  const local = rect({ x: 60, y: 100, w: 220, h: 50, label: "Local path\n./my-skill/", color: "purple" });
  const gitSrc = rect({ x: 60, y: 165, w: 220, h: 50, label: "Git URL\ngithub.com/org/skill", color: "purple" });
  const registry = rect({ x: 60, y: 230, w: 220, h: 50, label: "Registry\ncommunity/github@1.2.0", color: "purple" });
  const bundled  = rect({ x: 60, y: 295, w: 220, h: 50, label: "Bundled\n(compiled into binary)", color: "purple" });

  for (const b of [local, gitSrc, registry, bundled]) all.push(...b.elements);

  // Middle column: skill loader
  const audit = rect({ x: 360, y: 165, w: 200, h: 50, label: "Security Audit\n(on install)", color: "orange" });
  const loader = rect({ x: 360, y: 250, w: 200, h: 80, label: "Skill Loader\n• parse frontmatter\n• check eligibility", color: "teal" });
  const snapshot = rect({ x: 360, y: 360, w: 200, h: 80, label: "Build Snapshot\n• merge SKILL.md\n• register tools", color: "teal" });

  for (const b of [audit, loader, snapshot]) all.push(...b.elements);

  // Right column: agent run
  const sysprompt = rect({ x: 640, y: 250, w: 240, h: 60, label: "System Prompt\n(skills injected as XML)", color: "blue" });
  const toolEngine = rect({ x: 640, y: 340, w: 240, h: 60, label: "ToolEngine\n(skill tools registered)", color: "blue" });
  const agent = rect({ x: 640, y: 440, w: 240, h: 60, label: "Agent Run\n(mission starts)", color: "green" });

  for (const b of [sysprompt, toolEngine, agent]) all.push(...b.elements);

  // Eligibility check callout
  const elig = rect({ x: 360, y: 460, w: 200, h: 70, label: "Eligibility Check\n✓ bins installed?\n✓ env vars set?", color: "yellow" });
  all.push(...elig.elements);
  all.push(...label({ x: 300, y: 510, w: 60, text: "skip if ✗", fontSize: 11, color: "#e67700" }).elements);

  // Arrows: sources → audit (on install)
  for (const b of [local, gitSrc, registry]) {
    all.push(...arrow({
      from: { x: 280, y: b.elements[0].y + 25 },
      to: { x: 360, y: 190 },
    }).elements);
  }

  // bundled → loader (skip audit)
  all.push(...arrow({ from: { x: 280, y: 320 }, to: { x: 360, y: 290 }, dash: true, label: "no audit" }).elements);

  // audit → loader
  all.push(...arrow({ from: { x: 460, y: 215 }, to: { x: 460, y: 250 } }).elements);

  // loader → eligibility
  all.push(...arrow({ from: { x: 460, y: 330 }, to: { x: 460, y: 460 } }).elements);

  // eligibility → snapshot
  all.push(...arrow({ from: { x: 460, y: 460 }, to: { x: 460, y: 440 }, dash: true }).elements);

  // snapshot → sysprompt
  all.push(...arrow({ from: { x: 560, y: 380 }, to: { x: 640, y: 280 } }).elements);

  // snapshot → toolEngine
  all.push(...arrow({ from: { x: 560, y: 400 }, to: { x: 640, y: 370 } }).elements);

  // sysprompt + toolEngine → agent
  all.push(...arrow({ from: { x: 760, y: 400 }, to: { x: 760, y: 440 } }).elements);

  // compact mode callout
  const compact = rect({ x: 640, y: 160, w: 240, h: 70, label: "Injection Mode\nfull: all SKILL.md content\ncompact: catalog + skill_load tool", color: "gray" });
  all.push(...compact.elements);
  all.push(...arrow({ from: { x: 560, y: 360 }, to: { x: 640, y: 195 }, dash: true }).elements);

  return excalidraw(all);
}

// ─── Diagram 5: Multi-Repo Dependency Graph ───────────────────────────────────

function diagramRepos() {
  idCounter = 1;
  const all = [];

  all.push(...label({ x: 100, y: 20, w: 700, text: "Multi-Repo Architecture", fontSize: 20, color: "#1e1e1e", bold: true }).elements);

  const agentCore = rect({ x: 300, y: 80, w: 300, h: 80,
    label: "agent-core\n(Go binary + pkg/agent library)",
    color: "purple" });

  const skills = rect({ x: 700, y: 80, w: 240, h: 80,
    label: "skills\n(Git repo — skill registry\ncommunity/github@1.2.0)",
    color: "teal" });

  const platformApi = rect({ x: 300, y: 260, w: 300, h: 80,
    label: "platform-api\n(Go HTTP server)",
    color: "green" });

  const platformWeb = rect({ x: 300, y: 420, w: 300, h: 80,
    label: "platform-web\n(Next.js portal)",
    color: "blue" });

  for (const b of [agentCore, skills, platformApi, platformWeb]) all.push(...b.elements);

  // agent-core uses skills (install/load)
  all.push(...arrow({
    from: { x: 600, y: 120 }, to: { x: 700, y: 120 },
    label: "installs / reads registry.json"
  }).elements);

  // platform-api imports agent-core
  all.push(...arrow({
    from: { x: 450, y: 260 }, to: { x: 450, y: 160 },
    label: "imports pkg/agent (Go)"
  }).elements);

  // platform-web calls platform-api
  all.push(...arrow({
    from: { x: 450, y: 420 }, to: { x: 450, y: 340 },
    label: "REST + WebSocket"
  }).elements);

  // platform-api also reads skills
  all.push(...arrow({
    from: { x: 600, y: 300 }, to: { x: 820, y: 160 },
    label: "syncs registry", dash: true
  }).elements);

  // boundary labels
  all.push(...label({ x: 60, y: 90, w: 180, text: "Standalone binary\n(no platform needed)", fontSize: 12, color: "#7048e8" }).elements);
  all.push(...label({ x: 60, y: 270, w: 180, text: "Platform layer\n(imports agent-core)", fontSize: 12, color: "#2f9e44" }).elements);
  all.push(...label({ x: 60, y: 430, w: 180, text: "Web layer\n(HTTP only, no Go)", fontSize: 12, color: "#1971c2" }).elements);

  // Dependency rule note
  const note = rect({ x: 300, y: 560, w: 640, h: 60,
    label: "Dependency rule: platform-web knows nothing about Go. platform-api talks to agent-core as a library, not a process.",
    color: "gray", fontSize: 12 });
  all.push(...note.elements);

  return excalidraw(all);
}

// ─── Write files ─────────────────────────────────────────────────────────────

const diagrams = {
  "01-system-architecture.excalidraw":  diagramSystemArchitecture(),
  "02-tool-tiers.excalidraw":           diagramToolTiers(),
  "03-agent-turn-loop.excalidraw":      diagramTurnLoop(),
  "04-skill-loading.excalidraw":        diagramSkillLoading(),
  "05-multi-repo.excalidraw":           diagramRepos(),
};

for (const [filename, content] of Object.entries(diagrams)) {
  writeFileSync(new URL(filename, import.meta.url), content);
  console.log(`✓ ${filename}`);
}

console.log("\nOpen any .excalidraw file at https://excalidraw.com (File → Open)");
