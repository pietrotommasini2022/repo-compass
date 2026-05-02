import ts from "typescript";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { FileAnalysis, ExportItem, ResolvedImport } from "../types.js";
import { normalizePath } from "../types.js";

const printer = ts.createPrinter({ removeComments: true });

function hasExportModifier(node: ts.Node): boolean {
    if (!ts.canHaveModifiers(node)) return false;
    return ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function printType(node: ts.TypeNode, sourceFile: ts.SourceFile): string {
    return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).replace(/\s+/g, " ").trim();
}

function buildFnSignature(
    name: string,
    params: ts.NodeArray<ts.ParameterDeclaration>,
    returnType: ts.TypeNode | undefined,
    sourceFile: ts.SourceFile,
): string {
    const paramStr = params
        .map((p) => {
            const pName = ts.isIdentifier(p.name) ? p.name.text : "_";
            const pType = p.type ? printType(p.type, sourceFile) : "any";
            const opt = p.questionToken ? "?" : "";
            const rest = p.dotDotDotToken ? "..." : "";
            return `${rest}${pName}${opt}:${pType}`;
        })
        .join(",");
    const ret = returnType ? printType(returnType, sourceFile) : "void";
    return `${name}(${paramStr}):${ret}`;
}

function buildObjectSignature(members: ts.NodeArray<ts.TypeElement>, sourceFile: ts.SourceFile): string {
    const fields = members
        .filter((m): m is ts.PropertySignature => ts.isPropertySignature(m) && ts.isIdentifier(m.name))
        .map((m) => {
            const name = (m.name as ts.Identifier).text;
            const type = m.type ? printType(m.type, sourceFile) : "any";
            const opt = m.questionToken ? "?" : "";
            return `${name}${opt}:${type}`;
        })
        .join(",");
    return `{${fields}}`;
}

function resolveImport(raw: string, root: string, currentFile: string): ResolvedImport {
    if (!raw.startsWith(".")) {
        return { raw, resolved: null, isExternal: true };
    }

    const dir = path.dirname(path.join(root, currentFile));
    const base = raw.replace(/\.js$/, "").replace(/\.ts$/, "");

    for (const suffix of [".ts", ".tsx", ".js", ".jsx", ".mjs", "/index.ts", "/index.tsx", "/index.js", "/index.jsx", "/index.mjs"]) {
        const candidate = path.join(dir, base + suffix);
        if (existsSync(candidate)) {
            return {
                raw,
                resolved: normalizePath(path.relative(root, candidate)),
                isExternal: false,
            };
        }
    }

    return { raw, resolved: null, isExternal: false };
}

const REQUIRE_REGEX = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;

const PY_DEF_REGEX = /^def\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)(?:\s*->\s*([^:\n]+))?/gm;
const PY_CLASS_REGEX = /^class\s+([A-Z]\w*)(?:\s*\([^)]*\))?/gm;
const PY_CONST_REGEX = /^([A-Z_][A-Z0-9_]{2,})\s*=/gm;
const PY_ALL_REGEX = /__all__\s*=\s*\[([^\]]+)\]/;
const PY_REL_IMPORT_REGEX = /^from\s+(\.+)([a-zA-Z_]\w*)?\s+import/gm;
const PY_ABS_IMPORT_REGEX = /^(?:from\s+([a-zA-Z][a-zA-Z0-9_.]*)\s+import|import\s+([a-zA-Z][a-zA-Z0-9_.]*))/gm;

function resolvePythonImport(dots: string, module: string | undefined, root: string, currentFile: string): ResolvedImport {
    let targetDir = path.dirname(path.join(root, currentFile));
    for (let i = 1; i < dots.length; i++) targetDir = path.dirname(targetDir);

    const raw = `${dots}${module ?? ""}`;
    if (!module) return { raw, resolved: null, isExternal: false };

    const modPath = module.replace(/\./g, "/");
    for (const suffix of [".py", "/__init__.py"]) {
        const candidate = path.join(targetDir, modPath + suffix);
        if (existsSync(candidate)) {
            return { raw, resolved: normalizePath(path.relative(root, candidate)), isExternal: false };
        }
    }
    return { raw, resolved: null, isExternal: false };
}

function analyzePythonFile(root: string, relativePath: string, content: string): FileAnalysis {
    const exports: ExportItem[] = [];
    const imports: ResolvedImport[] = [];
    const seenExport = new Set<string>();

    // Check __all__ first — if present, it's the explicit export list
    const allMatch = PY_ALL_REGEX.exec(content);
    if (allMatch) {
        for (const name of allMatch[1].split(",").map((s) => s.replace(/['"'\s]/g, ""))) {
            if (name && !seenExport.has(name)) {
                exports.push({ kind: "variable", name });
                seenExport.add(name);
            }
        }
    } else {
        // Top-level functions
        for (const m of content.matchAll(PY_DEF_REGEX)) {
            if (m[1].startsWith("_")) continue;
            const params = m[2].replace(/\s+/g, " ").trim();
            const ret = m[3]?.trim() ?? "";
            const sig = ret ? `${m[1]}(${params}):${ret}` : `${m[1]}(${params})`;
            const compact = sig.length > 120 ? sig.slice(0, 117) + "…" : sig;
            if (!seenExport.has(m[1])) {
                exports.push({ kind: "function", name: m[1], signature: compact });
                seenExport.add(m[1]);
            }
        }
        // Top-level classes
        for (const m of content.matchAll(PY_CLASS_REGEX)) {
            if (!seenExport.has(m[1])) {
                exports.push({ kind: "class", name: m[1] });
                seenExport.add(m[1]);
            }
        }
        // CONSTANTS
        for (const m of content.matchAll(PY_CONST_REGEX)) {
            if (!seenExport.has(m[1])) {
                exports.push({ kind: "variable", name: m[1] });
                seenExport.add(m[1]);
            }
        }
    }

    // Relative imports
    const seenRaw = new Set<string>();
    for (const m of content.matchAll(PY_REL_IMPORT_REGEX)) {
        const resolved = resolvePythonImport(m[1], m[2], root, relativePath);
        if (!seenRaw.has(resolved.raw)) {
            imports.push(resolved);
            seenRaw.add(resolved.raw);
        }
    }
    // Absolute imports (external)
    for (const m of content.matchAll(PY_ABS_IMPORT_REGEX)) {
        const raw = m[1] ?? m[2];
        if (!seenRaw.has(raw)) {
            imports.push({ raw, resolved: null, isExternal: true });
            seenRaw.add(raw);
        }
    }

    return { relativePath, exports, imports };
}
const CJS_NAMED_EXPORT_REGEX = /(?:module\.exports|exports)\.(\w+)\s*=/g;
const CJS_DEFAULT_EXPORT_REGEX = /^\s*module\.exports\s*=\s*[^.]/m;

export function analyzeFile(root: string, relativePath: string): FileAnalysis {
    const absolutePath = path.join(root, relativePath);
    const content = readFileSync(absolutePath, "utf-8");

    if (relativePath.endsWith(".py")) return analyzePythonFile(root, relativePath, content);

    const sourceFile = ts.createSourceFile(relativePath, content, ts.ScriptTarget.ESNext, false);

    const exports: ExportItem[] = [];
    const imports: ResolvedImport[] = [];

    for (const statement of sourceFile.statements) {
        if (ts.isImportDeclaration(statement)) {
            const raw = (statement.moduleSpecifier as ts.StringLiteral).text;
            imports.push(resolveImport(raw, root, relativePath));
            continue;
        }

        if (ts.isExportAssignment(statement)) {
            exports.push({ kind: "default", name: "default" });
            continue;
        }

        if (ts.isExportDeclaration(statement)) {
            if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
                for (const spec of statement.exportClause.elements) {
                    exports.push({ kind: "re-export", name: spec.name.text });
                }
            }
            continue;
        }

        if (!hasExportModifier(statement)) continue;

        if (ts.isFunctionDeclaration(statement) && statement.name) {
            const sig = buildFnSignature(statement.name.text, statement.parameters, statement.type, sourceFile);
            exports.push({ kind: "function", name: statement.name.text, signature: sig });
        } else if (ts.isClassDeclaration(statement) && statement.name) {
            exports.push({ kind: "class", name: statement.name.text });
        } else if (ts.isInterfaceDeclaration(statement)) {
            const raw = buildObjectSignature(statement.members, sourceFile);
            const sig = raw.length > 120 ? raw.slice(0, 117) + "…" : raw;
            exports.push({ kind: "interface", name: statement.name.text, signature: sig });
        } else if (ts.isTypeAliasDeclaration(statement)) {
            const body = printer.printNode(ts.EmitHint.Unspecified, statement.type, sourceFile).replace(/\s+/g, " ").trim();
            const raw = ts.isTypeLiteralNode(statement.type)
                ? buildObjectSignature(statement.type.members, sourceFile)
                : body;
            const sig = raw.length > 120 ? raw.slice(0, 117) + "…" : raw;
            exports.push({ kind: "type", name: statement.name.text, signature: sig });
        } else if (ts.isEnumDeclaration(statement)) {
            exports.push({ kind: "enum", name: statement.name.text });
        } else if (ts.isVariableStatement(statement)) {
            for (const decl of statement.declarationList.declarations) {
                if (ts.isIdentifier(decl.name)) {
                    exports.push({ kind: "variable", name: decl.name.text });
                }
            }
        }
    }

    // CJS imports: merge require() calls, skip already-captured paths
    const seenRaw = new Set(imports.map((i) => i.raw));
    for (const match of content.matchAll(REQUIRE_REGEX)) {
        if (!seenRaw.has(match[1])) {
            imports.push(resolveImport(match[1], root, relativePath));
            seenRaw.add(match[1]);
        }
    }

    // CJS exports: only if no ES exports found
    if (exports.length === 0) {
        const seenExport = new Set<string>();
        for (const match of content.matchAll(CJS_NAMED_EXPORT_REGEX)) {
            if (!seenExport.has(match[1])) {
                exports.push({ kind: "variable", name: match[1] });
                seenExport.add(match[1]);
            }
        }
        if (exports.length === 0 && CJS_DEFAULT_EXPORT_REGEX.test(content)) {
            exports.push({ kind: "default", name: "default" });
        }
    }

    return { relativePath, exports, imports };
}
