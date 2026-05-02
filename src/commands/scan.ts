import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import readline from "node:readline";
import path from "node:path";
import { detectEntrypoints } from "../analyzers/entrypoints.js";
import { findSourceFiles } from "../analyzers/source-files.js";
import { buildModuleGraph } from "../analyzers/graph-builder.js";
import { generateCompactContext } from "../generators/context-compact.js";
import { detectProjectType } from "../analyzers/project-type.js";
import { detectSourceConfig } from "../analyzers/source-dirs.js";

type ProjectMeta = { name: string; version: string };

const LARGE_REPO_THRESHOLD = 300;

function confirm(question: string): Promise<boolean> {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase() === "y");
        });
    });
}

function readProjectMeta(root: string): ProjectMeta {
    // package.json
    const pkgPath = path.join(root, "package.json");
    if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        return { name: pkg.name ?? "unknown", version: pkg.version ?? "0.0.0" };
    }

    // pyproject.toml (minimal regex parse)
    const pyprojectPath = path.join(root, "pyproject.toml");
    if (existsSync(pyprojectPath)) {
        const content = readFileSync(pyprojectPath, "utf-8");
        const name = content.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1] ?? "unknown";
        const version = content.match(/^version\s*=\s*["']([^"']+)["']/m)?.[1] ?? "0.0.0";
        return { name, version };
    }

    // setup.py fallback
    const setupPath = path.join(root, "setup.py");
    if (existsSync(setupPath)) {
        const content = readFileSync(setupPath, "utf-8");
        const name = content.match(/name\s*=\s*["']([^"']+)["']/)?.[1] ?? "unknown";
        const version = content.match(/version\s*=\s*["']([^"']+)["']/)?.[1] ?? "0.0.0";
        return { name, version };
    }

    return { name: path.basename(root), version: "0.0.0" };
}

export const scanCommand = new Command("scan")
    .description("Analyze repository and generate CODEBASE.ctx for AI context.")
    .option("--all", "skip confirmation for large repos")
    .action(async (options: { all?: boolean }) => {
        const root = process.cwd();
        const meta = readProjectMeta(root);
        const entrypoints = detectEntrypoints(root);
        const sourceConfig = detectSourceConfig(root);
        const sourceFiles = await findSourceFiles(root, sourceConfig.patterns);

        if (sourceFiles.length === 0) {
            console.error("No source files found.");
            process.exitCode = 1;
            return;
        }

        if (sourceFiles.length > LARGE_REPO_THRESHOLD && !options.all) {
            console.log(`⚠  ${sourceFiles.length} source files found — above the recommended threshold of ${LARGE_REPO_THRESHOLD}.`);
            console.log(`   Beyond this limit, CODEBASE.ctx becomes too noisy and the AI may struggle to read it correctly.`);
            console.log(`   The output will switch to compact mode (core modules only). Use --all to suppress this warning.`);
            const ok = await confirm("Continue anyway? [y/N] ");
            if (!ok) {
                console.log("Scan cancelled.");
                return;
            }
        }

        const graph = buildModuleGraph(root, sourceFiles);
        const compactCtx = generateCompactContext(
            meta.name,
            meta.version,
            detectProjectType(root),
            entrypoints[0] ?? null,
            graph,
            sourceFiles,
            sourceConfig.isMonorepo,
        );
        writeFileSync(path.join(root, "CODEBASE.ctx"), compactCtx, "utf-8");
        console.log("✓ Generated CODEBASE.ctx");
    });
