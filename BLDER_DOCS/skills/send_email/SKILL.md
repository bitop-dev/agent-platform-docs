---
name: send_email
version: 0.1.0
description: "Send email via SMTP. Use when: delivering reports, notifications, or results to a recipient. NOT for: reading email, managing mailboxes, or when the user hasn't explicitly asked to send something."
author: platform-team
tags: [communication, email]
emoji: ✉️
always: false

requires:
  env: [SMTP_HOST, SMTP_USER, SMTP_PASS]

config:
  smtp_port:
    type: integer
    default: 587
    description: "SMTP server port"
  from_name:
    type: string
    default: "Agent Platform"
    description: "Sender display name"
  tls:
    type: boolean
    default: true
    description: "Use STARTTLS"
---

# Send Email

Send emails via SMTP. Used for delivering reports, notifications, or agent output to recipients.

## Setup

Set the required environment variables:
```bash
export SMTP_HOST=smtp.gmail.com
export SMTP_USER=you@gmail.com
export SMTP_PASS=your-app-password    # use an app password, not your account password
```

For Gmail, you'll need an [App Password](https://support.google.com/accounts/answer/185833).

## When to Use

✅ **USE this skill when:**
- The user explicitly asks to send or email something
- A scheduled agent needs to deliver its output (report, summary, alert)
- The agent config includes a `send_email` step in its workflow

❌ **DON'T use this skill when:**
- The user didn't ask to send anything — never send unsolicited email
- You need to read or check email — this is send-only
- The content isn't ready yet — finish your work first, then send

## Safety Rules

1. **Always confirm before sending** — Show the user the recipient, subject, and a preview of the body before calling the tool. Exception: scheduled agents with pre-configured recipients.
2. **Never send to addresses the user didn't specify** — Don't guess or infer recipients
3. **Don't include sensitive data** — API keys, passwords, tokens must never appear in email body
4. **One send per request** — Don't send multiple emails in a loop without explicit approval

## Email Format

- **Subject** should be specific and descriptive: "Weekly GitHub Summary — 2026-02-28" not "Report"
- **Body** should be plain text or simple HTML. Prefer plain text for reliability.
- **Attachments** are not supported in v1 — include content inline in the body
