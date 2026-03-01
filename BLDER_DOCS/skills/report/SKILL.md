---
name: report
version: 0.1.0
description: "Structure output into formatted markdown documents with sections, tables, and citations. Use when: building a report, creating a structured analysis, producing a deliverable document. NOT for: quick one-line answers, conversational responses, or raw data dumps."
author: platform-team
tags: [output, formatting, reports]
emoji: 📊
always: false

requires: {}
---

# Report Skill

Produce well-structured markdown documents. This skill has no external tool — it teaches you how to format output as a professional report. Apply these guidelines when the user needs a deliverable document.

## When to Use

✅ **USE this approach when:**
- The user asks for a "report", "analysis", "briefing", or "summary document"
- You've gathered research and need to present findings
- The output will be saved to a file or shared with others
- The task involves comparing options, analyzing data, or making recommendations

❌ **DON'T use this approach when:**
- The user wants a quick answer — just answer directly
- You're in the middle of a conversation — don't over-format chat responses
- The content is a single data point — don't wrap one fact in a report

## Report Structure

Every report should follow this structure:

```markdown
# [Report Title]

**Date:** YYYY-MM-DD
**Author:** [Agent name or "AI-generated"]
**Subject:** [One-line summary of what this report covers]

---

## Executive Summary

[2-3 sentences capturing the key finding or recommendation. A reader who only reads this section should understand the conclusion.]

## Findings

### [Finding 1 Title]

[Detail with supporting evidence. Include data, quotes, or links.]

### [Finding 2 Title]

[Detail...]

## Recommendations

1. [Specific, actionable recommendation]
2. [Another recommendation]

## Sources

- [Source title](URL) — [brief note on what was used from this source]
- [Source title](URL) — [brief note]
```

## Formatting Rules

1. **Use tables for comparisons** — Side-by-side data is always a table, never prose
2. **Use bullet points for lists** — More than 3 items in a sentence → bullet list
3. **Bold key terms on first use** — Helps scanning
4. **Include source links** — Every claim from research should cite where it came from
5. **Use code blocks for technical content** — Commands, configs, code snippets
6. **Keep sections scannable** — If a section is longer than ~10 lines, add a sub-heading
7. **Date the report** — Always include the date so the reader knows the context
