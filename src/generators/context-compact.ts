import type { ModuleGraph, ExportItem } from "../types.js";

const FULL_DETAIL_THRESHOLD = 300;

function fmtExport(exp: ExportItem): string {
    if (exp.kind === "function" && exp.signature) return exp.signature;
    return `${exp.name}:${exp.kind}`;
}

function fmtTypeBody(exp: ExportItem): string | null {
    if ((exp.kind === "type" || exp.kind === "interface") && exp.signature?.startsWith("{")) {
        return `  ${exp.name}${exp.signature}`;
    }
    if (exp.kind === "type" && exp.signature && !exp.signature.startsWith("{")) {
        return `  ${exp.name}=${exp.signature}`;
    }
    return null;
}

function emitFile(
    lines: string[],
    file: string,
    graph: ModuleGraph,
    compact: boolean,
): void {
    const analysis = graph.nodes.get(file);
    if (!analysis) return;

    const count = graph.importerCount.get(file) ?? 0;
    const isCore = count > 1;
    const coreTag = isCore ? ` [★${count}]` : "";

    if (compact && !isCore && analysis.exports.length === 0) return;

    const expStr =
        analysis.exports.length > 0
            ? " :: " + analysis.exports.map(fmtExport).join(" | ")
            : "";

    lines.push(`${file}${coreTag}${expStr}`);

    if (!compact || isCore) {
        const seen = new Set<string>();
        const internal = analysis.imports.filter((i) => {
            if (i.isExternal || !i.resolved) return false;
            if (seen.has(i.resolved)) return false;
            seen.add(i.resolved);
            return true;
        });
        if (internal.length > 0) {
            lines.push(`> ${internal.map((i) => i.resolved).join(",")}`);
        }
    }

    if (isCore) {
        for (const exp of analysis.exports) {
            const body = fmtTypeBody(exp);
            if (body) lines.push(body);
        }
    }

    lines.push("");
}

export function generateCompactContext(
    repoName: string,
    version: string,
    projectType: string,
    entry: string | null,
    graph: ModuleGraph,
    files: string[],
    isMonorepo: boolean,
): string {
    const lines: string[] = [];
    const compact = files.length > FULL_DETAIL_THRESHOLD;

    const lang = files.every((f) => f.endsWith(".py")) ? "py" : "ts";
    lines.push(`# ${repoName} ${version} | ${projectType}${isMonorepo ? " | monorepo" : ""} | ${lang}`);
    if (entry) lines.push(`@ ${entry}`);
    if (compact) {
        lines.push(`! large repo: ${files.length} files — full detail for core modules (★) only`);
    }
    lines.push("");

    for (const file of files) {
        emitFile(lines, file, graph, compact);
    }

    return lines.join("\n");
}
