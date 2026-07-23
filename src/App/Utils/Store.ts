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
