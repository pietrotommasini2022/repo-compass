import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const KNOWN_SOURCE_DIRS = ["src", "lib", "app", "pages", "components", "utils", "core", "server", "client"];
const IGNORE_DIRS = new Set([
    "node_modules", "dist", "build", ".git", ".next", ".turbo",
    "coverage", "out", "public", "static", "assets", ".cache",
]);
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", ".py"];
const EXT_GLOB = "{ts,tsx,js,jsx,mts,mjs,py}";

function hasSourceFiles(dir: string, depth = 0): boolean {
    if (depth > 2) return false;
    try {
        for (const item of readdirSync(dir)) {
            if (IGNORE_DIRS.has(item)) continue;
            const full = path.join(dir, item);
            const stat = statSync(full);
            if (stat.isFile() && SOURCE_EXTENSIONS.some((ext) => item.endsWith(ext))) return true;
            if (stat.isDirectory() && hasSourceFiles(full, depth + 1)) return true;
        }
    } catch {
        // ignore
    }
    return false;
}

function detectWorkspaceGlobs(root: string): string[] | null {
    // pnpm-workspace.yaml
    const pnpmWorkspace = path.join(root, "pnpm-workspace.yaml");
    if (existsSync(pnpmWorkspace)) {
        const content = readFileSync(pnpmWorkspace, "utf-8");
        const matches = [...content.matchAll(/^\s*-\s+["']?([^"'\n#]+?)["']?\s*$/gm)];
        if (matches.length > 0) return matches.map((m) => m[1].trim());
    }

    // package.json workspaces (yarn / npm / pnpm)
    const pkgPath = path.join(root, "package.json");
    if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (Array.isArray(pkg.workspaces)) return pkg.workspaces as string[];
        if (Array.isArray(pkg.workspaces?.packages)) return pkg.workspaces.packages as string[];
    }

    return null;
}

function inferSourceDirsFromPackageJson(root: string): string[] {
    const pkgPath = path.join(root, "package.json");
    if (!existsSync(pkgPath)) return [];

    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const candidates = new Set<string>();

    function extractDir(p: string) {
        const clean = p.replace(/^\.\//, "");
        const first = clean.split("/")[0];
        if (first === "dist" || first === "build" || first === "out") {
            candidates.add("src");
        } else if (KNOWN_SOURCE_DIRS.includes(first)) {
            candidates.add(first);
        }
    }

    if (typeof pkg.main === "string") extractDir(pkg.main);
    if (typeof pkg.bin === "string") extractDir(pkg.bin);
    if (pkg.bin && typeof pkg.bin === "object") {
        for (const v of Object.values(pkg.bin)) extractDir(v as string);
    }
    if (pkg.exports && typeof pkg.exports === "object") {
        for (const v of Object.values(pkg.exports)) {
            if (typeof v === "string") extractDir(v);
        }
    }

    return [...candidates].filter((d) => existsSync(path.join(root, d)));
}

export type SourceConfig = {
    patterns: string[];
    isMonorepo: boolean;
};

export function detectSourceConfig(root: string): SourceConfig {
    // 1. Monorepo?
    const workspaceGlobs = detectWorkspaceGlobs(root);
    if (workspaceGlobs && workspaceGlobs.length > 0) {
        const patterns = workspaceGlobs.flatMap((glob) => [
            `${glob}/src/**/*.${EXT_GLOB}`,
            `${glob}/lib/**/*.${EXT_GLOB}`,
            `${glob}/app/**/*.${EXT_GLOB}`,
            `${glob}/*.${EXT_GLOB}`,
        ]);
        return { patterns, isMonorepo: true };
    }

    // 2. Infer from package.json main/bin/exports
    const inferred = inferSourceDirsFromPackageJson(root);
    if (inferred.length > 0) {
        return {
            patterns: inferred.map((d) => `${d}/**/*.${EXT_GLOB}`),
            isMonorepo: false,
        };
    }

    // 3. Discover: check known dirs for source files
    const discovered = KNOWN_SOURCE_DIRS.filter((d) => {
        const full = path.join(root, d);
        return existsSync(full) && hasSourceFiles(full);
    });

    if (discovered.length > 0) {
        return {
            patterns: discovered.map((d) => `${d}/**/*.${EXT_GLOB}`),
            isMonorepo: false,
        };
    }

    // 4. Python flat layout: directories with __init__.py
    try {
        const pythonPackages = readdirSync(root).filter((item) => {
            if (IGNORE_DIRS.has(item) || item.startsWith(".")) return false;
            const full = path.join(root, item);
            return statSync(full).isDirectory() && existsSync(path.join(full, "__init__.py"));
        });
        if (pythonPackages.length > 0) {
            return {
                patterns: pythonPackages.map((d) => `${d}/**/*.py`),
                isMonorepo: false,
            };
        }
    } catch { /* ignore */ }

    // 5. Last resort: root-level source files
    return {
        patterns: [`*.${EXT_GLOB}`],
        isMonorepo: false,
    };
}
