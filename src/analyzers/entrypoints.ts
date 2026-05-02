import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function detectEntrypoints(root: string): string[] {
    const packageJsonPath = path.join(root, "package.json");

    if (!existsSync(packageJsonPath)) {
        return [];
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

    const entrypoints: string[] = [];

    // 1. bin → CLI entrypoint (più importante)
    if (typeof packageJson.bin === "string") {
        entrypoints.push(packageJson.bin);
    }

    if (packageJson.bin !== null && typeof packageJson.bin === "object") {
        entrypoints.push(...Object.values(packageJson.bin as Record<string, string>));
    }

    // 2. main → fallback
    if (packageJson.main) {
        entrypoints.push(packageJson.main);
    }

    return entrypoints;
}