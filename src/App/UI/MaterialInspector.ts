import GUI, { type Controller } from 'lil-gui'
import {
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Raycaster,
  SRGBColorSpace,
  Vector2,
  type Object3D,
  type PerspectiveCamera,
  type Texture,
} from 'three/webgpu'
import type { SurfaceMaterial } from '../World/Bathroom'

type EditableMaterial = MeshStandardMaterial | MeshPhysicalMaterial

interface MaterialHit {
  mesh: Mesh
  material: EditableMaterial
}

interface MaterialState {
  color: string
  roughness: number
  metalness: number
  normalScaleX: number
  normalScaleY: number
  aoIntensity: number
  localEnvironment: boolean
  envMapIntensity: number
  opacity: number
  transparent: boolean
  depthWrite: boolean
  emissive: string
  emissiveIntensity: number
  transmission?: number
  ior?: number
  thickness?: number
  clearcoat?: number
  clearcoatRoughness?: number
  specularIntensity?: number
  specularColor?: string
}

interface StoredMaterialState {
  values: MaterialState
  envMap: Texture | null
}

export interface MaterialInspectorOptions {
  gui: GUI
  canvas: HTMLCanvasElement
  camera: PerspectiveCamera
  model: Object3D
  modelPath: string
  setLocalEnvironment: (material: SurfaceMaterial, enabled: boolean) => void
  onChange: () => void
}

const round = (value: number): number => Number(value.toFixed(6))

export class MaterialInspector {
  private readonly folder: GUI
  private readonly raycaster = new Raycaster()
  private readonly pointer = new Vector2()
  private readonly pointerStart = new Vector2()
  private readonly lastPick = new Vector2(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  )
  private readonly editableControllers: Controller[] = []
  private readonly physicalControllers: Controller[] = []
  private readonly baseline = new Map<EditableMaterial, StoredMaterialState>()
  private readonly materialObjects = new Map<EditableMaterial, Set<string>>()
  private readonly canvas: HTMLCanvasElement
  private readonly camera: PerspectiveCamera
  private readonly model: Object3D
  private readonly modelPath: string
  private readonly setLocalEnvironment: MaterialInspectorOptions['setLocalEnvironment']
  private readonly onChange: () => void

  private selected: MaterialHit | null = null
  private pointerId = -1
  private hits: MaterialHit[] = []
  private hitIndex = 0
  private statusTimer = 0

  private readonly info = {
    object: 'Tap an object',
    material: '—',
    layer: '—',
  }

  private readonly values: MaterialState = {
    color: '#ffffff',
    roughness: 0.5,
    metalness: 0,
    normalScaleX: 1,
    normalScaleY: 1,
    aoIntensity: 1,
    localEnvironment: false,
    envMapIntensity: 1,
    opacity: 1,
    transparent: false,
    depthWrite: true,
    emissive: '#000000',
    emissiveIntensity: 1,
    transmission: 0,
    ior: 1.5,
    thickness: 0,
    clearcoat: 0,
    clearcoatRoughness: 0,
    specularIntensity: 1,
    specularColor: '#ffffff',
  }

  constructor(options: MaterialInspectorOptions) {
    this.canvas = options.canvas
    this.camera = options.camera
    this.model = options.model
    this.modelPath = options.modelPath
    this.setLocalEnvironment = options.setLocalEnvironment
    this.onChange = options.onChange
    this.folder = options.gui.addFolder('Material inspector')

    this.collectMaterials()
    this.buildGui()
    this.setControllersEnabled(false)

    this.canvas.addEventListener('pointerdown', this.handlePointerDown, {
      passive: true,
    })
    this.canvas.addEventListener('pointerup', this.handlePointerUp, {
      passive: true,
    })
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel, {
      passive: true,
    })
  }

  dispose(): void {
    window.clearTimeout(this.statusTimer)
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel)
  }

  captureOverrides(): object[] {
    const overrides: object[] = []

    for (const [material, stored] of this.baseline) {
      const parameters = this.capture(material)
      if (JSON.stringify(parameters) === JSON.stringify(stored.values)) continue

      overrides.push({
        material: material.name || '(unnamed)',
        objects: [...(this.materialObjects.get(material) ?? [])].sort(),
        parameters,
      })
    }

    return overrides
  }

  private collectMaterials(): void {
    this.model.traverse((object) => {
      if (!(object instanceof Mesh)) return

      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material]

      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial)) continue

        if (!this.baseline.has(material)) {
          this.baseline.set(material, {
            values: this.capture(material),
            envMap: material.envMap,
          })
        }

        const objects = this.materialObjects.get(material) ?? new Set<string>()
        objects.add(object.name || '(unnamed mesh)')
        this.materialObjects.set(material, objects)
      }
    })
  }

  private buildGui(): void {
    this.folder.add(this.info, 'object').name('Object').listen().disable()
    this.folder.add(this.info, 'material').name('Material').listen().disable()
    this.folder.add(this.info, 'layer').name('Hit layer').listen().disable()

    const add = (controller: Controller, physical = false): Controller => {
      this.editableControllers.push(controller)
      if (physical) this.physicalControllers.push(controller)
      return controller
    }

    add(this.folder.addColor(this.values, 'color').name('Color'))
      .onChange(() => this.applyValues())
    add(this.folder.add(this.values, 'roughness', 0, 1, 0.001).name('Roughness'))
      .onChange(() => this.applyValues())
    add(this.folder.add(this.values, 'metalness', 0, 1, 0.001).name('Metalness'))
      .onChange(() => this.applyValues())
    add(this.folder.add(this.values, 'normalScaleX', -4, 4, 0.001).name('Normal scale X'))
      .onChange(() => this.applyValues())
    add(this.folder.add(this.values, 'normalScaleY', -4, 4, 0.001).name('Normal scale Y'))
      .onChange(() => this.applyValues())
    add(this.folder.add(this.values, 'aoIntensity', 0, 4, 0.001).name('Material AO'))
      .onChange(() => this.applyValues())
    add(this.folder.add(this.values, 'localEnvironment').name('Local IBL'))
      .onChange(() => this.applyValues())
    add(this.folder.add(this.values, 'envMapIntensity', 0, 3, 0.001).name('IBL strength'))
      .onChange(() => this.applyValues())
    add(this.folder.add(this.values, 'opacity', 0, 1, 0.001).name('Opacity'))
      .onChange(() => this.applyValues())
    add(this.folder.add(this.values, 'transparent').name('Transparent'))
      .onChange(() => this.applyValues())
    add(this.folder.add(this.values, 'depthWrite').name('Depth write'))
      .onChange(() => this.applyValues())
    add(this.folder.addColor(this.values, 'emissive').name('Emissive'))
      .onChange(() => this.applyValues())
    add(this.folder.add(this.values, 'emissiveIntensity', 0, 20, 0.01).name('Emission'))
      .onChange(() => this.applyValues())

    const physical = this.folder.addFolder('Physical surface')
    add(physical.add(this.values, 'transmission', 0, 1, 0.001).name('Transmission'), true)
      .onChange(() => this.applyValues())
    add(physical.add(this.values, 'ior', 1, 1000, 0.001).name('IOR'), true)
      .onChange(() => this.applyValues())
    add(physical.add(this.values, 'thickness', 0, 5, 0.001).name('Thickness'), true)
      .onChange(() => this.applyValues())
    add(physical.add(this.values, 'clearcoat', 0, 1, 0.001).name('Clearcoat'), true)
      .onChange(() => this.applyValues())
    add(physical.add(this.values, 'clearcoatRoughness', 0, 1, 0.001).name('Coat roughness'), true)
      .onChange(() => this.applyValues())
    add(physical.add(this.values, 'specularIntensity', 0, 2, 0.001).name('Specular'), true)
      .onChange(() => this.applyValues())
    add(physical.addColor(this.values, 'specularColor').name('Specular color'), true)
      .onChange(() => this.applyValues())

    const actions = {
      nextLayer: (): void => this.selectNextLayer(),
      resetSelected: (): void => this.resetSelected(),
      copySelected: (): void => void this.copySelected(),
      copyAdjusted: (): void => void this.copyAdjusted(),
    }
    this.folder.add(actions, 'nextLayer').name('Next hit layer')
    this.folder.add(actions, 'resetSelected').name('Reset selected')
    this.folder.add(actions, 'copySelected').name('Copy selected')
    this.folder.add(actions, 'copyAdjusted').name('Copy all adjusted')
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.pointerId !== -1) return
    this.pointerId = event.pointerId
    this.pointerStart.set(event.clientX, event.clientY)
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return
    this.pointerId = -1

    const distance = this.pointerStart.distanceTo(
      this.pointer.set(event.clientX, event.clientY),
    )
    if (distance <= 6) this.pick(event.clientX, event.clientY)
  }

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.pointerId = -1
  }

  private pick(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)

    const unique = new Set<string>()
    const hits: MaterialHit[] = []
    for (const intersection of this.raycaster.intersectObject(this.model, true)) {
      if (!(intersection.object instanceof Mesh)) continue
      const mesh = intersection.object
      const materialIndex = intersection.face?.materialIndex ?? 0
      const material = Array.isArray(mesh.material)
        ? mesh.material[materialIndex]
        : mesh.material
      if (!(material instanceof MeshStandardMaterial)) continue

      const key = `${mesh.uuid}:${material.uuid}`
      if (unique.has(key)) continue
      unique.add(key)
      hits.push({ mesh, material })
    }

    if (hits.length === 0) return

    const pixel = new Vector2(clientX, clientY)
    const repeatedPick = this.lastPick.distanceTo(pixel) <= 10
    this.lastPick.copy(pixel)
    this.hits = hits
    this.hitIndex = repeatedPick ? (this.hitIndex + 1) % hits.length : 0
    this.select(this.hits[this.hitIndex])
  }

  private selectNextLayer(): void {
    if (this.hits.length === 0) return
    this.hitIndex = (this.hitIndex + 1) % this.hits.length
    this.select(this.hits[this.hitIndex])
  }

  private select(hit: MaterialHit): void {
    this.selected = hit
    this.info.object = hit.mesh.name || '(unnamed mesh)'
    this.info.material = hit.material.name || '(unnamed material)'
    this.info.layer = `${this.hitIndex + 1} / ${this.hits.length}`
    Object.assign(this.values, this.capture(hit.material))
    this.setControllersEnabled(true)
    this.refreshControllers()
    this.folder.open()
  }

  private applyValues(): void {
    const material = this.selected?.material
    if (!material) return

    material.color.set(this.values.color)
    material.roughness = this.values.roughness
    material.metalness = this.values.metalness
    material.normalScale.set(this.values.normalScaleX, this.values.normalScaleY)
    material.aoMapIntensity = this.values.aoIntensity
    this.setLocalEnvironment(material, this.values.localEnvironment)
    material.envMapIntensity = this.values.envMapIntensity
    material.opacity = this.values.opacity
    material.transparent = this.values.transparent
    material.depthWrite = this.values.depthWrite
    material.emissive.set(this.values.emissive)
    material.emissiveIntensity = this.values.emissiveIntensity

    if (material instanceof MeshPhysicalMaterial) {
      material.transmission = this.values.transmission ?? 0
      material.ior = this.values.ior ?? 1.5
      material.thickness = this.values.thickness ?? 0
      material.clearcoat = this.values.clearcoat ?? 0
      material.clearcoatRoughness = this.values.clearcoatRoughness ?? 0
      material.specularIntensity = this.values.specularIntensity ?? 1
      material.specularColor.set(this.values.specularColor ?? '#ffffff')
    }

    material.needsUpdate = true
    this.onChange()
  }

  private resetSelected(): void {
    const material = this.selected?.material
    const stored = material ? this.baseline.get(material) : undefined
    if (!material || !stored) return

    Object.assign(this.values, stored.values)
    material.envMap = stored.envMap
    this.applyValues()
    this.showStatus('Material inspector · reset')
  }

  private async copySelected(): Promise<void> {
    if (!this.selected) return

    await this.copy({
      version: 1,
      type: 'bathroom-material',
      model: this.modelPath,
      object: this.selected.mesh.name || '(unnamed mesh)',
      material: this.selected.material.name || '(unnamed material)',
      parameters: this.capture(this.selected.material),
    }, 'Material inspector · copied')
  }

  private async copyAdjusted(): Promise<void> {
    await this.copy({
      version: 1,
      type: 'bathroom-material-overrides',
      model: this.modelPath,
      materialOverrides: this.captureOverrides(),
    }, 'Material inspector · copied all')
  }

  private async copy(payload: object, message: string): Promise<void> {
    const json = JSON.stringify(payload, null, 2)
    let copied = false

    try {
      await navigator.clipboard.writeText(json)
      copied = true
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = json
      textarea.readOnly = true
      textarea.style.position = 'fixed'
      textarea.style.top = '-1000px'
      document.body.append(textarea)
      textarea.select()
      copied = document.execCommand('copy')
      textarea.remove()
    }

    this.showStatus(copied ? message : 'Material inspector · copy failed')
  }

  private showStatus(message: string): void {
    window.clearTimeout(this.statusTimer)
    this.folder.title(message)
    this.statusTimer = window.setTimeout(() => {
      this.folder.title('Material inspector')
    }, 1500)
  }

  private capture(material: EditableMaterial): MaterialState {
    const values: MaterialState = {
      color: `#${material.color.getHexString(SRGBColorSpace)}`,
      roughness: round(material.roughness),
      metalness: round(material.metalness),
      normalScaleX: round(material.normalScale.x),
      normalScaleY: round(material.normalScale.y),
      aoIntensity: round(material.aoMapIntensity),
      localEnvironment: material.envMap !== null,
      envMapIntensity: round(material.envMapIntensity),
      opacity: round(material.opacity),
      transparent: material.transparent,
      depthWrite: material.depthWrite,
      emissive: `#${material.emissive.getHexString(SRGBColorSpace)}`,
      emissiveIntensity: round(material.emissiveIntensity),
    }

    if (material instanceof MeshPhysicalMaterial) {
      values.transmission = round(material.transmission)
      values.ior = round(material.ior)
      values.thickness = round(material.thickness)
      values.clearcoat = round(material.clearcoat)
      values.clearcoatRoughness = round(material.clearcoatRoughness)
      values.specularIntensity = round(material.specularIntensity)
      values.specularColor = `#${material.specularColor.getHexString(SRGBColorSpace)}`
    }

    return values
  }

  private setControllersEnabled(enabled: boolean): void {
    for (const controller of this.editableControllers) {
      controller.enable(enabled)
    }
    this.setPhysicalControllersEnabled(
      enabled && this.selected?.material instanceof MeshPhysicalMaterial,
    )
  }

  private setPhysicalControllersEnabled(enabled: boolean): void {
    for (const controller of this.physicalControllers) {
      controller.enable(enabled)
    }
  }

  private refreshControllers(): void {
    for (const controller of this.folder.controllersRecursive()) {
      controller.updateDisplay()
    }
    this.setPhysicalControllersEnabled(
      this.selected?.material instanceof MeshPhysicalMaterial,
    )
  }
}
