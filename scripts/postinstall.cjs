const fs = require("fs");
const path = require("path");
const os = require("os");

const src = path.join(__dirname, "..", ".claude", "commands", "repo-compass.md");
const targetDir = path.join(os.homedir(), ".claude", "commands");
const target = path.join(targetDir, "repo-compass.md");

try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(src, target);
    console.log("✓ Installed /repo-compass skill to ~/.claude/commands/");
} catch {
    // Claude Code not installed or no write access — skip silently
}
