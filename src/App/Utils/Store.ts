import { Vector3 } from 'three/webgpu'

export const ASSET_PATHS = {
  model: '/models/bathroom_optimized.glb',
  environment: '/environment/studio_small_04_1k.hdr',
  basis: '/basis/',
  draco: '/draco/',
} as const

export const CAMERA_PRESET = {
  position: new Vector3(4.68, 1.55, -2.55),
  target: new Vector3(3.05, 1.3, -3.75),
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
    pixelRatio: 0.72,
    aoResolution: 0.35,
    aoSamples: 8,
    ssrResolution: 0.28,
    ssrQuality: 0.22,
    ssgiSlices: 1,
    ssgiSteps: 4,
  },
  balanced: {
    pixelRatio: 0.9,
    aoResolution: 0.45,
    aoSamples: 10,
    ssrResolution: 0.35,
    ssrQuality: 0.32,
    ssgiSlices: 1,
    ssgiSteps: 6,
  },
  high: {
    pixelRatio: 1.1,
    aoResolution: 0.6,
    aoSamples: 14,
    ssrResolution: 0.5,
    ssrQuality: 0.46,
    ssgiSlices: 2,
    ssgiSteps: 8,
  },
}
