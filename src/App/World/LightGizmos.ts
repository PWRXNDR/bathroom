import {
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  Raycaster,
  SphereGeometry,
  SpotLightHelper,
  Vector2,
  type LineBasicMaterial,
  type PerspectiveCamera,
  type Scene,
  type SpotLight,
} from 'three/webgpu'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'

export type LightGizmoHandle = 'position' | 'target'

const ACTIVE_COLOR = 0x39e7ff
const TARGET_COLOR = 0xff73c8

export class LightGizmos {
  readonly transform: TransformControls
  private readonly transformHelper
  private readonly helpers: SpotLightHelper[]
  private readonly positionMarkers: Mesh[] = []
  private readonly targetMarkers: Mesh[] = []
  private readonly raycaster = new Raycaster()
  private readonly pointer = new Vector2()
  private readonly positionGeometry = new SphereGeometry(0.045, 12, 8)
  private readonly targetGeometry = new OctahedronGeometry(0.06, 0)
  private selectedLight = 0
  private handle: LightGizmoHandle = 'target'
  private visible = false
  private orbitWasEnabled = true
  private translationSnap = 0
  private helperLength = 1

  constructor(
    private readonly scene: Scene,
    camera: PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    private readonly orbitControls: OrbitControls,
    private readonly lights: readonly SpotLight[],
    private readonly onChange: () => void,
  ) {
    this.helpers = lights.map((light) => this.createLightHelper(light))
    lights.forEach((light) => this.createMarkers(light))

    this.transform = new TransformControls(camera, canvas)
    this.transform.setMode('translate')
    this.transform.space = 'world'
    this.transform.size = 0.58
    this.transform.addEventListener('dragging-changed', this.handleDragging)
    this.transform.addEventListener('objectChange', this.handleObjectChange)
    this.transform.addEventListener('change', this.handleTransformChange)
    this.transformHelper = this.transform.getHelper()
    this.scene.add(this.transformHelper)
    this.canvas.addEventListener('pointerdown', this.handleMarkerSelection, true)

    this.attachSelectedObject()
    this.setVisible(false)
  }

  update(): void {
    if (!this.visible) return

    this.helpers.forEach((helper, index) => {
      const material = helper.cone.material as LineBasicMaterial
      helper.color = index === this.selectedLight ? ACTIVE_COLOR : undefined
      material.opacity = index === this.selectedLight ? 0.95 : 0.14
      helper.update()
      const width = this.helperLength * Math.tan(this.lights[index].angle)
      helper.cone.scale.set(width, width, this.helperLength)
    })

    this.positionMarkers.forEach((marker, index) => {
      const active = index === this.selectedLight && this.handle === 'position'
      const material = marker.material as MeshBasicMaterial
      material.color.set(active ? ACTIVE_COLOR : this.lights[index].color)
      material.opacity = active ? 1 : 0.58
      marker.scale.setScalar(active ? 1.35 : 1)
    })

    this.targetMarkers.forEach((marker, index) => {
      const active = index === this.selectedLight && this.handle === 'target'
      const material = marker.material as MeshBasicMaterial
      material.color.set(active ? ACTIVE_COLOR : TARGET_COLOR)
      material.opacity = active ? 1 : 0.52
      marker.scale.setScalar(active ? 1.35 : 1)
    })
  }

  isVisible(): boolean {
    return this.visible
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.transform.enabled = visible
    this.transformHelper.visible = visible
    this.helpers.forEach((helper) => {
      helper.visible = visible
    })
    this.positionMarkers.forEach((marker) => {
      marker.visible = visible
    })
    this.targetMarkers.forEach((marker) => {
      marker.visible = visible
    })

    if (!visible && this.transform.dragging) {
      this.orbitControls.enabled = this.orbitWasEnabled
    }

    if (visible) this.update()
  }

  getSelectedLight(): number {
    return this.selectedLight
  }

  setSelectedLight(index: number): void {
    this.selectedLight = Math.min(
      Math.max(Math.round(index), 0),
      this.lights.length - 1,
    )
    this.attachSelectedObject()
    this.update()
  }

  getHandle(): LightGizmoHandle {
    return this.handle
  }

  setHandle(handle: LightGizmoHandle): void {
    this.handle = handle
    this.attachSelectedObject()
    this.update()
  }

  getSize(): number {
    return this.transform.size
  }

  setSize(size: number): void {
    this.transform.size = size
  }

  getTranslationSnap(): number {
    return this.translationSnap
  }

  setTranslationSnap(step: number): void {
    this.translationSnap = Math.max(step, 0)
    this.transform.translationSnap = this.translationSnap || null
  }

  getHelperLength(): number {
    return this.helperLength
  }

  setHelperLength(length: number): void {
    this.helperLength = Math.max(length, 0.25)
    this.update()
  }

  refreshLight(light: SpotLight, invalidateShadow = true): void {
    light.updateMatrixWorld()
    light.target.updateMatrixWorld()
    if (invalidateShadow) {
      light.shadow.camera.updateProjectionMatrix()
      light.shadow.needsUpdate = true
    }
    this.helpers[this.lights.indexOf(light)]?.update()
  }

  dispose(): void {
    this.orbitControls.enabled = this.orbitWasEnabled
    this.transform.removeEventListener('dragging-changed', this.handleDragging)
    this.transform.removeEventListener('objectChange', this.handleObjectChange)
    this.transform.removeEventListener('change', this.handleTransformChange)
    this.canvas.removeEventListener('pointerdown', this.handleMarkerSelection, true)
    this.transform.detach()
    this.transform.dispose()
    this.transformHelper.removeFromParent()

    this.helpers.forEach((helper) => {
      helper.removeFromParent()
      helper.dispose()
    })
    this.positionMarkers.forEach((marker) => {
      marker.removeFromParent()
      const material = marker.material as MeshBasicMaterial
      material.dispose()
    })
    this.targetMarkers.forEach((marker) => {
      marker.removeFromParent()
      const material = marker.material as MeshBasicMaterial
      material.dispose()
    })
    this.positionGeometry.dispose()
    this.targetGeometry.dispose()
  }

  private createLightHelper(light: SpotLight): SpotLightHelper {
    const helper = new SpotLightHelper(light)
    const material = helper.cone.material as LineBasicMaterial
    material.depthTest = false
    material.depthWrite = false
    material.transparent = true
    material.opacity = 0.38
    material.toneMapped = false
    helper.cone.renderOrder = 1000
    this.scene.add(helper)
    return helper
  }

  private createMarkers(light: SpotLight): void {
    const positionMarker = new Mesh(
      this.positionGeometry,
      this.createMarkerMaterial(light.color.getHex()),
    )
    positionMarker.renderOrder = 1001
    positionMarker.frustumCulled = false
    positionMarker.castShadow = false
    positionMarker.receiveShadow = false
    light.add(positionMarker)
    this.positionMarkers.push(positionMarker)

    const targetMarker = new Mesh(
      this.targetGeometry,
      this.createMarkerMaterial(TARGET_COLOR),
    )
    targetMarker.renderOrder = 1001
    targetMarker.frustumCulled = false
    targetMarker.castShadow = false
    targetMarker.receiveShadow = false
    light.target.add(targetMarker)
    this.targetMarkers.push(targetMarker)
  }

  private createMarkerMaterial(color: number): MeshBasicMaterial {
    return new MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.58,
      toneMapped: false,
    })
  }

  private attachSelectedObject(): void {
    const light = this.lights[this.selectedLight]
    this.transform.attach(this.handle === 'position' ? light : light.target)
  }

  private readonly handleDragging = (event: { value: unknown }): void => {
    if (event.value === true) {
      this.orbitWasEnabled = this.orbitControls.enabled
      this.orbitControls.enabled = false
      return
    }

    this.orbitControls.enabled = this.orbitWasEnabled
  }

  private readonly handleObjectChange = (): void => {
    this.refreshLight(this.lights[this.selectedLight])
    this.update()
    this.onChange()
  }

  private readonly handleTransformChange = (): void => {
    this.onChange()
  }

  private readonly handleMarkerSelection = (event: PointerEvent): void => {
    if (!this.visible || event.button !== 0 || this.transform.dragging) return

    const bounds = this.canvas.getBoundingClientRect()
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.transform.camera)

    const markers = [...this.positionMarkers, ...this.targetMarkers]
    const intersection = this.raycaster.intersectObjects(markers, false)[0]
    if (!intersection) return

    const positionIndex = this.positionMarkers.indexOf(intersection.object as Mesh)
    const targetIndex = this.targetMarkers.indexOf(intersection.object as Mesh)
    const index = positionIndex >= 0 ? positionIndex : targetIndex
    const handle: LightGizmoHandle = positionIndex >= 0 ? 'position' : 'target'
    if (index === this.selectedLight && handle === this.handle) return

    event.preventDefault()
    event.stopImmediatePropagation()
    this.selectedLight = index
    this.handle = handle
    this.attachSelectedObject()
    this.update()
    this.onChange()
  }
}
