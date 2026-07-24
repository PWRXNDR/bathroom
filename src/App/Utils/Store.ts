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
    4.776145,
    0.479259,
    -3.681254,
  ),
  target: new Vector3(
    2.135028,
    0.873405,
    -3.9145,
  ),
} as const
