import { Vector3 } from 'three/webgpu'

export const ASSET_PATHS = {
  model: '/models/bathroom_decimated2_optimized.glb',
  environment: '/environment/studio_small_08_1k.hdr',
  basis: '/basis/',
  draco: '/draco/',
} as const

export const CAMERA_PRESET = {
  position: new Vector3(
    4.701486185665289,
    1.7293424924378216,
    -5.122794137977619,
  ),
  target: new Vector3(
    2.8116709936440594,
    1.043221654572334,
    -3.4039136664218153,
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
    ssrResolution: 0.5,
    ssrQuality: 0.46,
    ssgiSlices: 2,
    ssgiSteps: 8,
  },
}
