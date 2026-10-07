export type Category = 'person' | 'address' | 'email' | 'phone' | 'identifier' | 'url' | 'username' | 'secret';
export type Span = { start: number; end: number; category: Category; score: number; source: string };
export type Segment = { id: string; text: string };
export type Detection = { id: string; spans: Span[] };
export type ScanProgress = { phase: 'loading' | 'scanning'; completed: number; total: number };
export type ProgressRoute = { tabId: number; scanId: string };
export type ModelFile = { path: string; size: number; sha256: string };
export type ModelSpec = {
  id: string; name: string; upstream: string; repo: string; revision: string;
  adapter: string; license: string; files: ModelFile[]; languages: string[];
};
/** Adapters know about tensors. The UI, scanner and renderer know only UTF-16 spans. */
export interface Detector {
  readonly id: string;
  load(): Promise<void>;
  detect(text: string, threshold: number): Promise<Span[]>;
  dispose(): Promise<void>;
}
export type Settings = { modelId: string; threshold: number; categories: Category[]; blockSize: number; hideAvatars: boolean; manualTerms: string[] };
export const DEFAULT_SETTINGS: Settings = {
  modelId: 'gliner2-pii-q8', threshold: 0.5,
  categories: ['person', 'address', 'email', 'phone', 'identifier', 'secret'],
  blockSize: 8, hideAvatars: false, manualTerms: [],
};
export function normalizeSettings(value: Partial<Settings> = {}): Settings {
  const categories: Category[] = ['person', 'address', 'email', 'phone', 'identifier', 'url', 'username', 'secret'];
  return {
    ...DEFAULT_SETTINGS, ...value,
    threshold: Math.min(0.95, Math.max(0.1, Number(value.threshold) || DEFAULT_SETTINGS.threshold)),
    blockSize: Math.min(24, Math.max(6, Number(value.blockSize) || DEFAULT_SETTINGS.blockSize)),
    categories: Array.isArray(value.categories) ? value.categories.filter(c => categories.includes(c)) : DEFAULT_SETTINGS.categories,
    manualTerms: Array.isArray(value.manualTerms) ? value.manualTerms.filter(t => typeof t === 'string' && t.trim()).slice(0, 100) : [],
  };
}
