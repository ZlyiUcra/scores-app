import type { TCreatedPdf, TDocumentDefinitions, TVirtualFileSystem } from 'pdfmake/interfaces';

type PdfMakeApi = {
  createPdf: (doc: TDocumentDefinitions) => TCreatedPdf;
  addVirtualFileSystem: (vfs: TVirtualFileSystem) => void;
};

function isPdfMakeApi(value: unknown): value is PdfMakeApi {
  if (typeof value !== 'object' || value === null) return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.createPdf === 'function' && typeof rec.addVirtualFileSystem === 'function';
}

function isVirtualFileSystem(value: unknown): value is TVirtualFileSystem {
  if (typeof value !== 'object' || value === null) return false;
  return Object.keys(value).some((k) => k.endsWith('.ttf'));
}

/**
 * `pdfmake/build/pdfmake` and `pdfmake/build/vfs_fonts` are pre-bundled
 * webpack UMD output (see the package's own `browser` field); re-bundling a
 * webpack bundle through Rollup's CJS interop does not reliably land the real
 * export at `.default` - Rollup synthesizes its OWN (minifier-chosen, build-
 * to-build unstable) property name for the interop wrapper instead. Rather
 * than hardcode that name, walk the module namespace's own values (and one
 * level of nested `.default`) for the shape we actually need.
 */
function unwrap<T>(mod: object, isMatch: (value: unknown) => value is T): T {
  for (const value of Object.values(mod)) {
    if (isMatch(value)) return value;
    if (value && typeof value === 'object' && 'default' in value) {
      const inner = (value as { default: unknown }).default;
      if (isMatch(inner)) return inner;
    }
  }
  throw new Error('pdfmake module has an unexpected shape - could not locate its API.');
}

/** Lazily loads pdfmake + its default (Roboto) font set, wired together, so
 * every call site just gets back a ready-to-use API object. Never imported
 * outside this module - the one place pdfmake's weight is pulled in. */
export async function loadPdfMake(): Promise<PdfMakeApi> {
  const [pdfMakeMod, vfsMod] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  const pdfMake = unwrap(pdfMakeMod, isPdfMakeApi);
  const vfs = unwrap(vfsMod, isVirtualFileSystem);
  pdfMake.addVirtualFileSystem(vfs);
  return pdfMake;
}
