import {
  ACESFilmicToneMapping,
  PCFShadowMap,
  SRGBColorSpace,
  WebGPURenderer,
} from 'three/webgpu'
import WebGPU from 'three/addons/capabilities/WebGPU.js'
import type { Sizes } from './Utils/Sizes'

export class Renderer {
  readonly instance: WebGPURenderer
  private pixelRatio = 1

  constructor(
    canvas: HTMLCanvasElement,
    private readonly sizes: Sizes,
  ) {
    this.instance = new WebGPURenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.instance.outputColorSpace = SRGBColorSpace
    this.instance.toneMapping = ACESFilmicToneMapping
    this.instance.toneMappingExposure = 0.73
    this.instance.shadowMap.enabled = true
    this.instance.shadowMap.type = PCFShadowMap

    sizes.onResize(() => this.resize())
  }

  async init(): Promise<void> {
    if (!WebGPU.isAvailable()) {
      throw new Error('WebGPU is required')
    }

    await this.instance.init()

    const backend = this.instance.backend as { isWebGPUBackend?: boolean }
    if (backend.isWebGPUBackend !== true) {
      throw new Error('WebGPU backend initialization failed')
    }

    this.setPixelRatio(1)
  }

  setPixelRatio(pixelRatio: number): void {
    this.pixelRatio = Math.max(0.5, pixelRatio)
    this.instance.setPixelRatio(this.pixelRatio)
    this.resize()
  }

  getPixelRatio(): number {
    return this.pixelRatio
  }

  private resize(): void {
    this.instance.setSize(this.sizes.width, this.sizes.height, false)
  }
}
