---
name: summarize
version: 0.1.0
description: "Summarize long text into concise output. Use when: the user asks for a summary, you have lengthy content that needs condensing, or you need to distill research findings. NOT for: short text that's already concise, content you haven't read yet (fetch it first), or when the user wants the full detail."
author: platform-team
tags: [text, analysis, research]
emoji: 📝
always: false

requires: {}
---

# Summarize

Produce concise summaries of long text. This skill has no external tool — it teaches you how to summarize well. Apply these guidelines whenever you're condensing content.

## When to Use

✅ **USE this approach when:**
- The user explicitly asks for a summary
- You've fetched a long page and need to extract key points
- You're building a report and need to condense research
- The content exceeds what's useful to present in full

❌ **DON'T summarize when:**
- The text is already short (under ~500 words)
- The user asked for the full content or exact quotes
- You haven't read the content yet — read first, then summarize
- The content is code — don't summarize code, show it

## Summary Guidelines

1. **Lead with the conclusion** — Start with the single most important takeaway
2. **Use bullet points for multiple findings** — Easier to scan than paragraphs
3. **Preserve numbers and specifics** — "Revenue grew 23% to $4.2B" not "Revenue grew significantly"
4. **Cite sources** — If summarizing from multiple pages, note where each fact came from
5. **Match the length to the task**:
   - Quick lookup → 1-2 sentences
   - Research summary → 3-5 bullet points
   - Detailed briefing → short paragraphs with headers
6. **Flag uncertainty** — If the source is ambiguous or contradictory, say so
7. **Don't inject opinions** — Summarize what the source says, not what you think about it
