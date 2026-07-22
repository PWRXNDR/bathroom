import { PerspectiveCamera } from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CAMERA_PRESET } from './Utils/Store'
import type { Sizes } from './Utils/Sizes'

export class Camera {
  readonly instance: PerspectiveCamera
  readonly controls: OrbitControls

  constructor(canvas: HTMLCanvasElement, sizes: Sizes) {
    this.instance = new PerspectiveCamera(
      67,
      sizes.width / sizes.height,
      0.035,
      30,
    )
    this.instance.position.copy(CAMERA_PRESET.position)

    this.controls = new OrbitControls(this.instance, canvas)
    this.controls.target.copy(CAMERA_PRESET.target)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.065
    this.controls.enablePan = false
    this.controls.minDistance = 0.45
    this.controls.maxDistance = 3.1
    this.controls.minPolarAngle = 0.58
    this.controls.maxPolarAngle = 2.35
    this.controls.rotateSpeed = 0.42
    this.controls.zoomSpeed = 0.65
    this.controls.update()

    sizes.onResize((width, height) => {
      this.instance.aspect = width / height
      this.instance.updateProjectionMatrix()
    })
  }

  update(): void {
    this.controls.update()
  }

  dispose(): void {
    this.controls.dispose()
  }
}
