# repo-compass

Static code intelligence for AI-assisted development. Run one command, get a dense `CODEBASE.ctx` file that tells an AI everything it needs to know about your codebase — in under 2000 tokens.

## What it does

`repo-compass scan` walks your source files, extracts exports, resolves imports, builds a module dependency graph, and writes `CODEBASE.ctx` to the repo root. No API calls. No AI. Pure local compute.

```
src/commands/scan.ts [★3] :: scanCommand:variable
> src/analyzers/entrypoints.ts,src/analyzers/source-files.ts,src/analyzers/graph-builder.ts

src/analyzers/file-analyzer.ts [★4] :: analyzeFile(root:string,relativePath:string):FileAnalysis
> src/types.ts

src/types.ts [★6] :: ExportItem:type | ResolvedImport:type | FileAnalysis:type | ModuleGraph:type | normalizePath(p:string):string
```

An AI reading this file understands your entire codebase structure — what each module exports, which modules are central (★), and how data flows between them — in a single read.

## Install

```bash
npm install -g repo-compass
```

## Usage

```bash
cd your-project
repo-compass scan
```

Generates `CODEBASE.ctx` in the current directory. Open it, paste it to any AI, or use the Claude Code skill (see below).

### Options

```
--all    Skip confirmation prompt for large repos (>300 files)
```

## Claude Code skill

The `/repo-compass` slash command is installed automatically when you install the package globally. No extra setup needed.

In any Claude Code session:

```
/repo-compass
```

Claude runs the CLI, reads `CODEBASE.ctx`, and instantly has full codebase context — without reading individual files or consuming thousands of tokens.

> **Manual install:** if you installed via a local clone or need to reinstall the skill, run `node scripts/postinstall.cjs` from the package root, or copy `.claude/commands/repo-compass.md` to `~/.claude/commands/`.

## What it analyzes

**Languages:** TypeScript, JavaScript (ESM + CJS), Python

**Extracts:**
- Functions with signatures and return types
- Classes, interfaces, type aliases, enums
- Re-exports and default exports
- CJS `module.exports` patterns
- Python functions, classes, constants, `__all__`

**Graph:**
- Resolves relative imports to actual file paths (handles `.js` → `.ts` NodeNext convention)
- Counts how many files import each module (★ = imported by 2+)
- Core modules get full detail; leaf modules get summary-only

**Project detection:**
- Monorepos: `pnpm-workspace.yaml`, `package.json workspaces`
- Source roots: `src/`, `lib/`, `app/`, `pages/`, and more
- Python flat layout: directories with `__init__.py`
- Project type: `cli` | `library` | `app` | `unknown`

## Large repos

Above 300 files, `CODEBASE.ctx` switches to compact mode: only core modules (★) get full import/export detail. Leaf files appear as a single line. This keeps the file readable and useful even on large codebases.

You'll be prompted before scanning large repos. Use `--all` to skip.

## Token efficiency

A typical 50-file project generates a `CODEBASE.ctx` of ~1000 tokens. Reading individual source files for the same coverage would cost 20–50×. At 300 files, compact mode keeps output under 6000 tokens while preserving full fidelity for the modules that matter.

## License

MIT
