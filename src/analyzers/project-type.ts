import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type ProjectType = "cli" | "library" | "app" | "unknown";

export function detectProjectType(root: string): ProjectType {
    const packageJsonPath = path.join(root, "package.json");

    if (!existsSync(packageJsonPath)) {
        return "unknown";
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

    if (packageJson.bin) return "cli";
    if (packageJson.dependencies?.commander || packageJson.devDependencies?.commander) return "cli";

    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (deps.next || deps.nuxt || deps.remix || deps["@sveltejs/kit"] || deps.expo) return "app";

    if (packageJson.main || packageJson.exports) return "library";
    if (Array.isArray(packageJson.files)) return "library";

    return "unknown";
}