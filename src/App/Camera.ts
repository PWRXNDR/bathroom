import { MOUSE, PerspectiveCamera, TOUCH } from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CAMERA_PRESET } from './Utils/Store'
import type { Sizes } from './Utils/Sizes'

export class Camera {
  readonly instance: PerspectiveCamera
  readonly controls: OrbitControls

  constructor(canvas: HTMLCanvasElement, sizes: Sizes) {
    this.instance = new PerspectiveCamera(
      82.5468,
      sizes.width / sizes.height,
      0.035,
      30,
    )
    this.instance.position.copy(CAMERA_PRESET.position)

    this.controls = new OrbitControls(this.instance, canvas)
    this.controls.target.copy(CAMERA_PRESET.target)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.065
    this.controls.enablePan = true
    this.controls.screenSpacePanning = true
    this.controls.enableZoom = true
    this.controls.minDistance = 0.08
    this.controls.maxDistance = 10
    this.controls.minPolarAngle = 0.01
    this.controls.maxPolarAngle = Math.PI - 0.01
    this.controls.rotateSpeed = 0.42
    this.controls.panSpeed = 0.72
    this.controls.zoomSpeed = 0.72
    this.controls.keyPanSpeed = 18
    this.controls.mouseButtons.LEFT = MOUSE.ROTATE
    this.controls.mouseButtons.MIDDLE = MOUSE.ROTATE
    this.controls.mouseButtons.RIGHT = MOUSE.PAN
    this.controls.touches.ONE = TOUCH.ROTATE
    this.controls.touches.TWO = TOUCH.DOLLY_PAN
    this.controls.listenToKeyEvents(window)
    this.controls.update()

    sizes.onResize((width, height) => {
      this.instance.aspect = width / height
      this.instance.updateProjectionMatrix()
    })
  }

  update(): boolean {
    return this.controls.update()
  }

  dispose(): void {
    this.controls.stopListenToKeyEvents()
    this.controls.dispose()
  }
}
