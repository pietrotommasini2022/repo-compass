---
name: repo-compass
description: >
  Generate dense codebase context for AI-assisted development.
  Scans source files and writes CODEBASE.ctx — no API calls, pure local compute.
  Use when user says "scan this codebase", "load codebase context", "give me a project map",
  "run repo-compass", or invokes /repo-compass.
install: npm install -g repo-compass
command: repo-compass scan
---

## Installation

```bash
npm install -g repo-compass
```

## Usage

After installation, use the `/repo-compass` slash command in Claude Code or run:

```bash
repo-compass scan
```

Generates `CODEBASE.ctx` in the current directory with full source context ready for AI consumption.
