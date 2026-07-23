import { Vector3 } from 'three/webgpu'

export const ASSET_PATHS = {
  model: '/models/bathroom_decimated2_optimized.glb',
  towel: '/models/towel_optimized.glb',
  environment: '/environment/studio_small_08_1k.hdr',
  basis: '/basis/',
  draco: '/draco/',
} as const

export const CAMERA_PRESET = {
  position: new Vector3(
    4.776144981927044,
    0.47925929221785896,
    -3.6812544098889997,
  ),
  target: new Vector3(
    2.135027732733314,
    0.8734051223777649,
    -3.914499737144692,
  ),
} as const

export type QualityLevel = 'low' | 'balanced' | 'high'

export interface QualityProfile {
  pixelRatio: number
  aoResolution: number
  aoSamples: number
  ssrResolution: number
  ssrQuality: number
  ssgiSlices: number
  ssgiSteps: number
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  low: {
    pixelRatio: 0.9,
    aoResolution: 0.28,
    aoSamples: 8,
    ssrResolution: 0.22,
    ssrQuality: 0.22,
    ssgiSlices: 1,
    ssgiSteps: 4,
  },
  balanced: {
    pixelRatio: 1.25,
    aoResolution: 0.32,
    aoSamples: 10,
    ssrResolution: 0.25,
    ssrQuality: 0.32,
    ssgiSlices: 1,
    ssgiSteps: 6,
  },
  high: {
    pixelRatio: 1.25,
    aoResolution: 0.6,
    aoSamples: 14,
    ssrResolution: 0.75,
    ssrQuality: 0.65,
    ssgiSlices: 2,
    ssgiSteps: 8,
  },
}
