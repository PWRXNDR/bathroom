import {
  ACESFilmicToneMapping,
  PCFShadowMap,
  SRGBColorSpace,
  TimestampQuery,
  WebGPURenderer,
} from 'three/webgpu'
import WebGPU from 'three/addons/capabilities/WebGPU.js'
import type { Sizes } from './Utils/Sizes'

const MIN_RENDER_SCALE = 1.25
const MAX_RENDER_SCALE = 1.75

export class Renderer {
  readonly instance: WebGPURenderer
  private pixelRatio = 1
  private readonly maxPixelRatio: number
  private gpuTimestampsSupported = false

  constructor(
    canvas: HTMLCanvasElement,
    private readonly sizes: Sizes,
  ) {
    this.maxPixelRatio = Math.min(
      Math.max(window.devicePixelRatio, MIN_RENDER_SCALE),
      MAX_RENDER_SCALE,
    )
    // Сглаживание выполняет TAA, поэтому MSAA здесь не нужен.
    this.instance = new WebGPURenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      trackTimestamp: true,
    })
    this.instance.outputColorSpace = SRGBColorSpace
    this.instance.toneMapping = ACESFilmicToneMapping
    this.instance.toneMappingExposure = 0.668
    this.instance.shadowMap.enabled = true
    this.instance.shadowMap.type = PCFShadowMap

    sizes.onResize(() => this.resize())
  }

  async init(): Promise<void> {
    if (!WebGPU.isAvailable()) {
      throw new Error('WebGPU is required')
    }

    await this.instance.init()

    // Проверяем, что запущен именно WebGPU backend.
    const backend = this.instance.backend as { isWebGPUBackend?: boolean }
    if (backend.isWebGPUBackend !== true) {
      throw new Error('WebGPU backend initialization failed')
    }

    this.gpuTimestampsSupported = this.instance.hasFeature('timestamp-query')
    this.setPixelRatio(this.maxPixelRatio)
  }

  setPixelRatio(pixelRatio: number): void {
    const nextPixelRatio = Math.min(
      Math.max(pixelRatio, MIN_RENDER_SCALE),
      this.maxPixelRatio,
    )
    if (Math.abs(nextPixelRatio - this.pixelRatio) < 0.001) return

    this.pixelRatio = nextPixelRatio
    this.instance.setPixelRatio(this.pixelRatio)
    this.resize()
  }

  getPixelRatio(): number {
    return this.pixelRatio
  }

  supportsGpuTimestamps(): boolean {
    return this.gpuTimestampsSupported
  }

  async resolveGpuTime(): Promise<number | null> {
    if (!this.gpuTimestampsSupported) return null

    // Получаем время GPU для последнего завершённого кадра.
    const duration = await this.instance.resolveTimestampsAsync(
      TimestampQuery.RENDER,
    )
    return duration !== undefined && Number.isFinite(duration) ? duration : null
  }

  private resize(): void {
    this.instance.setSize(this.sizes.width, this.sizes.height, false)
  }
}
