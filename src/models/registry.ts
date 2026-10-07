import type { Detector, ModelSpec } from '../types.ts';
import { Gliner2Detector } from './gliner2.ts';
/** Register a new adapter here. No scanner, UI, or renderer changes required. */
const adapters: Record<string, (spec: ModelSpec) => Detector> = {
  'gliner2-onnx': spec => new Gliner2Detector(spec),
};
export function createDetector(spec: ModelSpec): Detector {
  const factory = adapters[spec.adapter];
  if (!factory) throw new Error(`Unsupported local detector adapter: ${spec.adapter}`);
  return factory(spec);
}
