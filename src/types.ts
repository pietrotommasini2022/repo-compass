export type ExportItem = {
    kind: "function" | "class" | "variable" | "type" | "interface" | "enum" | "default" | "re-export";
    name: string;
    signature?: string;
};

export type ResolvedImport = {
    raw: string;
    resolved: string | null;
    isExternal: boolean;
};

export type FileAnalysis = {
    relativePath: string;
    exports: ExportItem[];
    imports: ResolvedImport[];
};

export type ModuleGraph = {
    nodes: Map<string, FileAnalysis>;
    importerCount: Map<string, number>;
};

export function normalizePath(p: string): string {
    return p.replaceAll("\\", "/").replace(/^\.\//, "");
}
