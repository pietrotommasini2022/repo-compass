import { analyzeFile } from "./file-analyzer.js";
import type { ModuleGraph } from "../types.js";

export function buildModuleGraph(root: string, files: string[]): ModuleGraph {
    const nodes = new Map();
    const importerCount = new Map<string, number>();

    for (const file of files) {
        nodes.set(file, analyzeFile(root, file));
        if (!importerCount.has(file)) {
            importerCount.set(file, 0);
        }
    }

    for (const [, analysis] of nodes) {
        for (const imp of analysis.imports) {
            if (imp.resolved && nodes.has(imp.resolved)) {
                importerCount.set(imp.resolved, (importerCount.get(imp.resolved) ?? 0) + 1);
            }
        }
    }

    return { nodes, importerCount };
}
