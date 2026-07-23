import GUI, { type Controller } from 'lil-gui'
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  CineonToneMapping,
  LinearToneMapping,
  MathUtils,
  NeutralToneMapping,
  NoToneMapping,
  ReinhardToneMapping,
  SRGBColorSpace,
  type Color,
  type SpotLight,
} from 'three/webgpu'
import type { AdaptiveQuality } from '../AdaptiveQuality'
import type { Camera } from '../Camera'
import type { PostProcessing } from '../PostProcessing'
import type { Renderer } from '../Renderer'
import { ASSET_PATHS, type QualityLevel } from '../Utils/Store'
import {
  type LightGizmoHandle,
  type LightGizmos,
} from '../World/LightGizmos'
import type { World } from '../World/World'

export interface TuningPanelOptions {
  camera: Camera
  renderer: Renderer
  world: World
  post: PostProcessing
  quality: AdaptiveQuality
  lightGizmos: LightGizmos
  onChange?: () => void
}

type BindingOptions = {
  afterChange?: () => void
  manualQuality?: boolean
  refreshPipeline?: boolean
}

const TONE_MAPPINGS = {
  None: NoToneMapping,
  Linear: LinearToneMapping,
  Reinhard: ReinhardToneMapping,
  Cineon: CineonToneMapping,
  ACES: ACESFilmicToneMapping,
  AgX: AgXToneMapping,
  Neutral: NeutralToneMapping,
} as const

export class TuningPanel {
  readonly gui = new GUI({
    title: 'Bathroom tuning',
    width: 340,
    closeFolders: true,
  })

  private readonly camera: Camera
  private readonly renderer: Renderer
  private readonly world: World
  private readonly post: PostProcessing
  private readonly quality: AdaptiveQuality
  private readonly lightGizmos: LightGizmos
  private readonly onChange: () => void
  private copyResetTimer = 0

  constructor(options: TuningPanelOptions) {
    this.camera = options.camera
    this.renderer = options.renderer
    this.world = options.world
    this.post = options.post
    this.quality = options.quality
    this.lightGizmos = options.lightGizmos
    this.onChange = options.onChange ?? (() => undefined)

    this.addCameraControls()
    this.addRendererControls()
    this.addLightControls()
    this.addAoControls()
    this.addSsrControls()
    this.addSsgiControls()
    this.addTaaControls()
    this.addCopyButton()
  }

  dispose(): void {
    window.clearTimeout(this.copyResetTimer)
    this.gui.destroy()
  }

  private addCameraControls(): void {
    const folder = this.gui.addFolder('Camera')
    const camera = this.camera.instance
    const controls = this.camera.controls
    const updateProjection = (): void => camera.updateProjectionMatrix()
    const updateControls = (): void => {
      camera.updateMatrixWorld()
      controls.update()
    }

    this.number(folder, 'FOV', () => camera.fov, (value) => {
      camera.fov = value
    }, 35, 110, 0.1, { afterChange: updateProjection })

    const position = folder.addFolder('Position')
    this.vector(position, camera.position, updateControls, -15, 15, 0.001)

    const target = folder.addFolder('Target')
    this.vector(target, controls.target, updateControls, -15, 15, 0.001)

    this.number(folder, 'Rotate speed', () => controls.rotateSpeed, (value) => {
      controls.rotateSpeed = value
    }, 0.05, 2, 0.01)
    this.number(folder, 'Pan speed', () => controls.panSpeed, (value) => {
      controls.panSpeed = value
    }, 0.05, 2, 0.01)
    this.number(folder, 'Zoom speed', () => controls.zoomSpeed, (value) => {
      controls.zoomSpeed = value
    }, 0.05, 2, 0.01)
    this.number(folder, 'Damping', () => controls.dampingFactor, (value) => {
      controls.dampingFactor = value
    }, 0, 0.25, 0.001)
  }

  private addRendererControls(): void {
    const folder = this.gui.addFolder('Renderer & grade')
    const renderer = this.renderer.instance
    const scene = this.world.scene

    this.boolean(folder, 'Adaptive quality', () => this.quality.isEnabled(), (value) => {
      this.quality.setEnabled(value)
    })
    this.select<QualityLevel>(
      folder,
      'Quality profile',
      () => this.quality.getLevel(),
      (value) => this.quality.setLevel(value),
      ['low', 'balanced', 'high'],
    )
    this.number(folder, 'Render scale', () => this.renderer.getPixelRatio(), (value) => {
      this.renderer.setPixelRatio(value)
    }, 0.5, 2, 0.05, { manualQuality: true })
    this.select(
      folder,
      'Tone mapping',
      () => renderer.toneMapping,
      (value) => {
        renderer.toneMapping = value
      },
      TONE_MAPPINGS,
      { refreshPipeline: true },
    )
    this.number(folder, 'Exposure', () => renderer.toneMappingExposure, (value) => {
      renderer.toneMappingExposure = value
    }, 0.1, 3, 0.01)
    this.number(folder, 'Environment', () => scene.environmentIntensity, (value) => {
      scene.environmentIntensity = value
    }, 0, 3, 0.01)
    this.number(folder, 'Environment yaw', () => MathUtils.radToDeg(scene.environmentRotation.y), (value) => {
      scene.environmentRotation.y = MathUtils.degToRad(value)
      this.world.bathroom.setEnvironmentRotation(scene.environmentRotation)
    }, -180, 180, 0.1)
    this.number(folder, 'Saturation', () => this.post.getSaturation(), (value) => {
      this.post.setSaturation(value)
    }, 0, 2, 0.01)
    this.number(folder, 'Sharpen', () => this.post.getSharpenAmount(), (value) => {
      this.post.setSharpenAmount(value)
    }, 0, 2, 0.01)
  }

  private addLightControls(): void {
    const folder = this.gui.addFolder('Lights')
    const gizmos = folder.addFolder('3D gizmos')
    this.boolean(gizmos, 'Visible', () => this.lightGizmos.isVisible(), (value) => {
      this.lightGizmos.setVisible(value)
    })
    this.select<number>(
      gizmos,
      'Selected',
      () => this.lightGizmos.getSelectedLight(),
      (value) => this.lightGizmos.setSelectedLight(value),
      {
        'Spot 1': 0,
        'Spot 2': 1,
        'Spot 3': 2,
      },
    )
    this.select<LightGizmoHandle>(
      gizmos,
      'Handle',
      () => this.lightGizmos.getHandle(),
      (value) => this.lightGizmos.setHandle(value),
      {
        'Light position': 'position',
        'Aim target': 'target',
      },
    )
    this.number(gizmos, 'Handle size', () => this.lightGizmos.getSize(), (value) => {
      this.lightGizmos.setSize(value)
    }, 0.25, 2, 0.01)
    this.number(gizmos, 'Cone length', () => this.lightGizmos.getHelperLength(), (value) => {
      this.lightGizmos.setHelperLength(value)
    }, 0.5, 4, 0.05)
    this.number(gizmos, 'Move snap', () => this.lightGizmos.getTranslationSnap(), (value) => {
      this.lightGizmos.setTranslationSnap(value)
    }, 0, 0.5, 0.005)

    const ambient = folder.addFolder('Ambient')
    this.color(ambient, 'Color', this.world.ambientLight.color)
    this.number(ambient, 'Intensity', () => this.world.ambientLight.intensity, (value) => {
      this.world.ambientLight.intensity = value
    }, 0, 5, 0.01)

    this.world.spotLights.forEach((light, index) => {
      this.addSpotLightControls(folder.addFolder(`Spot ${index + 1}`), light)
    })
  }

  private addSpotLightControls(folder: GUI, light: SpotLight): void {
    const syncLight = (): void => this.lightGizmos.refreshLight(light, false)
    const invalidateShadow = (): void => this.lightGizmos.refreshLight(light, true)
    const lightUpdate: BindingOptions = { afterChange: syncLight }
    const shadowUpdate: BindingOptions = { afterChange: invalidateShadow }

    this.color(folder, 'Color', light.color, lightUpdate)
    this.number(folder, 'Intensity', () => light.intensity, (value) => {
      light.intensity = value
    }, 0, 200, 0.1, lightUpdate)
    this.number(folder, 'Distance', () => light.distance, (value) => {
      light.distance = value
    }, 0, 20, 0.01, shadowUpdate)
    this.number(folder, 'Angle', () => MathUtils.radToDeg(light.angle), (value) => {
      light.angle = MathUtils.degToRad(value)
    }, 1, 89, 0.1, shadowUpdate)
    this.number(folder, 'Penumbra', () => light.penumbra, (value) => {
      light.penumbra = value
    }, 0, 1, 0.001, lightUpdate)
    this.number(folder, 'Decay', () => light.decay, (value) => {
      light.decay = value
    }, 0, 4, 0.01, lightUpdate)

    const position = folder.addFolder('Position')
    this.vector(position, light.position, invalidateShadow, -15, 15, 0.001)
    const target = folder.addFolder('Target')
    this.vector(target, light.target.position, invalidateShadow, -15, 15, 0.001)

    const shadow = folder.addFolder('Shadow')
    this.boolean(shadow, 'Enabled', () => light.castShadow, (value) => {
      light.castShadow = value
    }, shadowUpdate)
    this.number(shadow, 'Bias', () => light.shadow.bias, (value) => {
      light.shadow.bias = value
    }, -0.01, 0.01, 0.00001, lightUpdate)
    this.number(shadow, 'Normal bias', () => light.shadow.normalBias, (value) => {
      light.shadow.normalBias = value
    }, 0, 0.05, 0.0001, lightUpdate)
    this.number(shadow, 'Radius', () => light.shadow.radius, (value) => {
      light.shadow.radius = value
    }, 0, 10, 0.1, lightUpdate)
    this.number(shadow, 'Intensity', () => light.shadow.intensity, (value) => {
      light.shadow.intensity = value
    }, 0, 1, 0.01, lightUpdate)
  }

  private addAoControls(): void {
    const folder = this.gui.addFolder('SSAO / GTAO')
    const effect = this.post.aoPass

    this.number(folder, 'Contribution', () => this.post.getAoContribution(), (value) => {
      this.post.setAoContribution(value)
    }, 0, 1.5, 0.01)
    this.number(folder, 'Radius', () => effect.radius.value, (value) => {
      effect.radius.value = value
    }, 0.01, 3, 0.01)
    this.number(folder, 'Thickness', () => effect.thickness.value, (value) => {
      effect.thickness.value = value
    }, 0.001, 2, 0.001)
    this.number(folder, 'Distance exponent', () => effect.distanceExponent.value, (value) => {
      effect.distanceExponent.value = value
    }, 0.1, 4, 0.01)
    this.number(folder, 'Distance falloff', () => effect.distanceFallOff.value, (value) => {
      effect.distanceFallOff.value = value
    }, 0, 1, 0.01)
    this.number(folder, 'Scale', () => effect.scale.value, (value) => {
      effect.scale.value = value
    }, 0, 3, 0.01)
    this.number(folder, 'Samples', () => effect.samples.value, (value) => {
      effect.samples.value = Math.round(value)
    }, 2, 32, 1, { manualQuality: true })
    this.number(folder, 'Resolution', () => effect.resolutionScale, (value) => {
      effect.resolutionScale = value
    }, 0.1, 1, 0.01, { manualQuality: true })
    this.boolean(folder, 'Temporal filter', () => effect.useTemporalFiltering, (value) => {
      effect.useTemporalFiltering = value
    }, { refreshPipeline: true })
  }

  private addSsrControls(): void {
    const folder = this.gui.addFolder('SSR')
    const effect = this.post.ssrPass

    this.number(folder, 'Contribution', () => this.post.getSsrContribution(), (value) => {
      this.post.setSsrContribution(value)
    }, 0, 2, 0.01)
    this.number(folder, 'Intensity', () => effect.intensity.value, (value) => {
      effect.intensity.value = value
    }, 0, 3, 0.01)
    this.number(folder, 'Max distance', () => effect.maxDistance.value, (value) => {
      effect.maxDistance.value = value
    }, 0.1, 10, 0.01)
    this.number(folder, 'Thickness', () => effect.thickness.value, (value) => {
      effect.thickness.value = value
    }, 0.001, 1, 0.001)
    this.number(folder, 'Edge fade', () => effect.screenEdgeFade.value, (value) => {
      effect.screenEdgeFade.value = value
    }, 0, 0.5, 0.001)
    this.number(folder, 'Max luminance', () => effect.maxLuminance.value, (value) => {
      effect.maxLuminance.value = value
    }, 0.1, 20, 0.1)
    this.number(folder, 'Mirror bias', () => effect.mirrorBias.value, (value) => {
      effect.mirrorBias.value = value
    }, 0, 1, 0.01)
    this.number(folder, 'Quality', () => effect.quality.value, (value) => {
      effect.quality.value = value
    }, 0.05, 1, 0.01, { manualQuality: true })
    this.number(folder, 'Resolution', () => effect.resolutionScale, (value) => {
      effect.resolutionScale = value
    }, 0.1, 1, 0.01, { manualQuality: true })
    this.number(folder, 'Blur quality', () => effect.blurQuality, (value) => {
      effect.blurQuality = Math.round(value)
    }, 0, 5, 1, { refreshPipeline: true })
    this.boolean(folder, 'Reflect non-metals', () => effect.reflectNonMetals, (value) => {
      effect.reflectNonMetals = value
    }, { refreshPipeline: true })
  }

  private addSsgiControls(): void {
    const folder = this.gui.addFolder('SSGI')
    const effect = this.post.ssgiPass

    this.number(folder, 'Contribution', () => this.post.getSsgiContribution(), (value) => {
      this.post.setSsgiContribution(value)
    }, 0, 2, 0.01)
    this.number(folder, 'GI intensity', () => effect.giIntensity.value, (value) => {
      effect.giIntensity.value = value
    }, 0, 5, 0.01)
    this.number(folder, 'AO intensity', () => effect.aoIntensity.value, (value) => {
      effect.aoIntensity.value = value
    }, 0, 5, 0.01)
    this.number(folder, 'Radius', () => effect.radius.value, (value) => {
      effect.radius.value = value
    }, 0.01, 5, 0.01)
    this.number(folder, 'Thickness', () => effect.thickness.value, (value) => {
      effect.thickness.value = value
    }, 0.001, 2, 0.001)
    this.number(folder, 'Exponent', () => effect.expFactor.value, (value) => {
      effect.expFactor.value = value
    }, 0.1, 5, 0.01)
    this.number(folder, 'Backface light', () => effect.backfaceLighting.value, (value) => {
      effect.backfaceLighting.value = value
    }, 0, 1, 0.01)
    this.number(folder, 'Slices', () => effect.sliceCount.value, (value) => {
      effect.sliceCount.value = Math.round(value)
    }, 1, 8, 1, { manualQuality: true })
    this.number(folder, 'Steps', () => effect.stepCount.value, (value) => {
      effect.stepCount.value = Math.round(value)
    }, 1, 32, 1, { manualQuality: true })
    this.boolean(folder, 'Screen sampling', () => effect.useScreenSpaceSampling.value, (value) => {
      effect.useScreenSpaceSampling.value = value
    })
    this.boolean(folder, 'Linear thickness', () => effect.useLinearThickness.value, (value) => {
      effect.useLinearThickness.value = value
    })
    this.boolean(folder, 'Temporal filter', () => effect.useTemporalFiltering, (value) => {
      effect.useTemporalFiltering = value
    }, { refreshPipeline: true })
  }

  private addTaaControls(): void {
    const folder = this.gui.addFolder('TAA')
    const effect = this.post.taaPass

    this.boolean(folder, 'Enabled', () => this.post.isTaaEnabled(), (value) => {
      this.post.setTaaEnabled(value)
    })
    this.number(folder, 'Velocity length', () => effect.maxVelocityLength, (value) => {
      effect.maxVelocityLength = value
    }, 1, 256, 1, { refreshPipeline: true })
    this.number(folder, 'Depth threshold', () => effect.depthThreshold, (value) => {
      effect.depthThreshold = value
    }, 0.00001, 0.01, 0.00001, { refreshPipeline: true })
    this.number(folder, 'Edge depth diff', () => effect.edgeDepthDiff, (value) => {
      effect.edgeDepthDiff = value
    }, 0.00001, 0.02, 0.00001, { refreshPipeline: true })
    this.boolean(folder, 'Subpixel correction', () => effect.useSubpixelCorrection, (value) => {
      effect.useSubpixelCorrection = value
    }, { refreshPipeline: true })
  }

  private addCopyButton(): void {
    const actions = {
      copyParameters: (): void => {
        void this.copyParameters()
      },
    }
    const controller = this.gui
      .add(actions, 'copyParameters')
      .name('Copy params')

    controller.onChange(() => this.onChange())
    ;(controller as Controller & { $button?: HTMLButtonElement }).$button?.setAttribute(
      'aria-label',
      'Copy current tuning parameters',
    )
  }

  private async copyParameters(): Promise<void> {
    const json = JSON.stringify(this.captureParameters(), null, 2)
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
      textarea.style.opacity = '0'
      document.body.append(textarea)
      textarea.focus({ preventScroll: true })
      textarea.select()
      textarea.setSelectionRange(0, textarea.value.length)
      copied = document.execCommand('copy')
      textarea.remove()
    }

    window.clearTimeout(this.copyResetTimer)
    this.gui.title(copied ? 'Parameters copied' : 'Copy failed')
    this.copyResetTimer = window.setTimeout(() => {
      this.gui.title('Bathroom tuning')
    }, 1400)
  }

  private captureParameters(): object {
    const camera = this.camera.instance
    const controls = this.camera.controls
    const renderer = this.renderer.instance
    const ao = this.post.aoPass
    const ssr = this.post.ssrPass
    const ssgi = this.post.ssgiPass
    const taa = this.post.taaPass

    return {
      version: 1,
      model: ASSET_PATHS.model,
      camera: {
        fov: camera.fov,
        near: camera.near,
        far: camera.far,
        position: camera.position.toArray(),
        target: controls.target.toArray(),
        rotateSpeed: controls.rotateSpeed,
        panSpeed: controls.panSpeed,
        zoomSpeed: controls.zoomSpeed,
        dampingFactor: controls.dampingFactor,
      },
      renderer: {
        toneMapping: this.toneMappingName(renderer.toneMapping),
        toneMappingValue: renderer.toneMapping,
        exposure: renderer.toneMappingExposure,
        renderScale: this.renderer.getPixelRatio(),
      },
      environment: {
        intensity: this.world.scene.environmentIntensity,
        rotation: this.world.scene.environmentRotation.toArray(),
      },
      lights: {
        ambient: {
          color: this.colorHex(this.world.ambientLight.color),
          intensity: this.world.ambientLight.intensity,
        },
        spots: this.world.spotLights.map((light) => ({
          color: this.colorHex(light.color),
          intensity: light.intensity,
          position: light.position.toArray(),
          target: light.target.position.toArray(),
          distance: light.distance,
          angle: light.angle,
          angleDegrees: MathUtils.radToDeg(light.angle),
          penumbra: light.penumbra,
          decay: light.decay,
          castShadow: light.castShadow,
          shadow: {
            bias: light.shadow.bias,
            normalBias: light.shadow.normalBias,
            radius: light.shadow.radius,
            intensity: light.shadow.intensity,
            mapSize: light.shadow.mapSize.toArray(),
          },
        })),
      },
      ssao: {
        contribution: this.post.getAoContribution(),
        radius: ao.radius.value,
        thickness: ao.thickness.value,
        distanceExponent: ao.distanceExponent.value,
        distanceFallOff: ao.distanceFallOff.value,
        scale: ao.scale.value,
        samples: ao.samples.value,
        resolutionScale: ao.resolutionScale,
        temporalFiltering: ao.useTemporalFiltering,
      },
      ssr: {
        contribution: this.post.getSsrContribution(),
        intensity: ssr.intensity.value,
        maxDistance: ssr.maxDistance.value,
        thickness: ssr.thickness.value,
        screenEdgeFade: ssr.screenEdgeFade.value,
        maxLuminance: ssr.maxLuminance.value,
        mirrorBias: ssr.mirrorBias.value,
        quality: ssr.quality.value,
        resolutionScale: ssr.resolutionScale,
        blurQuality: ssr.blurQuality,
        reflectNonMetals: ssr.reflectNonMetals,
      },
      ssgi: {
        contribution: this.post.getSsgiContribution(),
        giIntensity: ssgi.giIntensity.value,
        aoIntensity: ssgi.aoIntensity.value,
        radius: ssgi.radius.value,
        thickness: ssgi.thickness.value,
        expFactor: ssgi.expFactor.value,
        backfaceLighting: ssgi.backfaceLighting.value,
        sliceCount: ssgi.sliceCount.value,
        stepCount: ssgi.stepCount.value,
        useScreenSpaceSampling: ssgi.useScreenSpaceSampling.value,
        useLinearThickness: ssgi.useLinearThickness.value,
        temporalFiltering: ssgi.useTemporalFiltering,
      },
      taa: {
        enabled: this.post.isTaaEnabled(),
        maxVelocityLength: taa.maxVelocityLength,
        depthThreshold: taa.depthThreshold,
        edgeDepthDiff: taa.edgeDepthDiff,
        useSubpixelCorrection: taa.useSubpixelCorrection,
      },
      composite: {
        saturation: this.post.getSaturation(),
        sharpen: this.post.getSharpenAmount(),
      },
      quality: {
        adaptive: this.quality.isEnabled(),
        profile: this.quality.getLevel(),
      },
      lightGizmos: {
        visible: this.lightGizmos.isVisible(),
        selectedLight: this.lightGizmos.getSelectedLight(),
        handle: this.lightGizmos.getHandle(),
        size: this.lightGizmos.getSize(),
        coneLength: this.lightGizmos.getHelperLength(),
        translationSnap: this.lightGizmos.getTranslationSnap(),
      },
    }
  }

  private number(
    folder: GUI,
    label: string,
    get: () => number,
    set: (value: number) => void,
    min: number,
    max: number,
    step: number,
    options: BindingOptions = {},
  ): Controller {
    const state = this.liveValue(get, (value) => {
      set(Number(value))
      this.changed(options)
    })
    return folder.add(state, 'value', min, max, step).name(label).listen()
  }

  private boolean(
    folder: GUI,
    label: string,
    get: () => boolean,
    set: (value: boolean) => void,
    options: BindingOptions = {},
  ): Controller {
    const state = this.liveValue(get, (value) => {
      set(Boolean(value))
      this.changed(options)
    })
    return folder.add(state, 'value').name(label).listen()
  }

  private select<T extends string | number>(
    folder: GUI,
    label: string,
    get: () => T,
    set: (value: T) => void,
    choices: readonly T[] | Record<string, T>,
    options: BindingOptions = {},
  ): Controller {
    const state = this.liveValue(get, (value) => {
      set(value as T)
      this.changed(options)
    })
    return folder.add(state, 'value', choices as T[] | Record<string, T>).name(label).listen()
  }

  private color(
    folder: GUI,
    label: string,
    color: Color,
    options: BindingOptions = {},
  ): Controller {
    const state = this.liveValue(
      () => this.colorHex(color),
      (value) => {
        color.set(String(value))
        this.changed(options)
      },
    )
    return folder.addColor(state, 'value').name(label).listen()
  }

  private vector(
    folder: GUI,
    vector: { x: number; y: number; z: number },
    afterChange: () => void,
    min: number,
    max: number,
    step: number,
  ): void {
    for (const axis of ['x', 'y', 'z'] as const) {
      this.number(folder, axis.toUpperCase(), () => vector[axis], (value) => {
        vector[axis] = value
      }, min, max, step, { afterChange })
    }
  }

  private liveValue<T>(
    get: () => T,
    set: (value: T) => void,
  ): { value: T } {
    return {
      get value(): T {
        return get()
      },
      set value(value: T) {
        set(value)
      },
    }
  }

  private changed(options: BindingOptions): void {
    if (options.manualQuality) this.quality.setEnabled(false)
    if (options.refreshPipeline) this.post.refreshPipeline()
    options.afterChange?.()
    this.onChange()
  }

  private colorHex(color: Color): string {
    return `#${color.getHexString(SRGBColorSpace)}`
  }

  private toneMappingName(value: number): string {
    return Object.entries(TONE_MAPPINGS).find(([, mapping]) => mapping === value)?.[0]
      ?? String(value)
  }
}
