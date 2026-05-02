import fg from "fast-glob";
import { normalizePath } from "../types.js";

export async function findSourceFiles(root: string, patterns: string[]): Promise<string[]> {
    const files = await fg(patterns, {
        cwd: root,
        ignore: ["**/*.d.ts", "**/*.test.*", "**/*.spec.*", "**/node_modules/**", "**/test_*.py", "**/*_test.py", "**/conftest.py"],
        onlyFiles: true,
    });
    return files.map(normalizePath).sort();
}
