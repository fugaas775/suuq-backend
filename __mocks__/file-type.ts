// Jest manual mock for ESM-only 'file-type' package to avoid ESM transform issues in ts-jest.
// Provides only the API surface actually used in the codebase.
export type FileTypeResult = { ext: string; mime: string };
export async function fileTypeFromBuffer(_buf: Buffer): Promise<FileTypeResult | undefined> {
  return undefined; // In tests we don't need real detection.
}
