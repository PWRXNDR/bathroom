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
    4.383897,
    1.482921,
    -5.176851,
  ),
  target: new Vector3(
    2.26059,
    1.547152,
    -3.928228,
  ),
} as const
