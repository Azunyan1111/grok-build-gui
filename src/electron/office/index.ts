/**
 * Office document preview entry point.
 *
 * Spreadsheets are parsed here — the grid needs structured cells, not a
 * document to lay out. Word only gets read and size-checked here; its layout
 * renderer needs a DOM and therefore runs in the renderer.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { readDocBytes } from "./bytes.js";
import { readSheet } from "./sheet.js";
import {
  MAX_OFFICE_BYTES,
  type OfficeDocument,
  type OfficeKind,
} from "./types.js";

export * from "./types.js";
export { writeSheet } from "./sheet.js";

const KIND_BY_EXT: Record<string, OfficeKind> = {
  ".csv": "sheet",
  ".tsv": "sheet",
  ".xlsx": "sheet",
  ".docx": "doc",
};

/** `null` for anything the in-app viewers do not handle. */
export function officeKindForPath(filePath: string): OfficeKind | null {
  return KIND_BY_EXT[path.extname(filePath).toLowerCase()] ?? null;
}

/**
 * Formats without an in-app parser are handed to the OS instead.
 */
export function isLegacyOfficeBinary(filePath: string): boolean {
  return [".doc", ".ppt", ".pptx", ".xls", ".ods"].includes(
    path.extname(filePath).toLowerCase(),
  );
}

export async function readOfficeDocument(
  filePath: string,
  options?: { sheet?: string },
): Promise<OfficeDocument> {
  const kind = officeKindForPath(filePath);
  if (!kind) throw new Error("Unsupported document type");

  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error("Not a file");
  if (stat.size > MAX_OFFICE_BYTES) {
    throw new Error(
      `File is too large to preview (${Math.round(stat.size / 1024 / 1024)} MB)`,
    );
  }

  if (kind === "sheet") return await readSheet(filePath, options?.sheet);
  return await readDocBytes(filePath);
}
