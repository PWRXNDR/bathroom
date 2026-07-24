import { Camera } from './Camera'
import { PostProcessing } from './PostProcessing'
import { Renderer } from './Renderer'
import { UI } from './UI/UI'
import { Preloader } from './UI/Preloader'
import { AssetLoader } from './Utils/AssetLoader'
import { Sizes } from './Utils/Sizes'
import { GPU_PROFILE } from './Utils/Store'
import { World } from './World/World'

const ACTIVE_FPS = 45
const IDLE_FPS = 30
const QUALITY_SAMPLE_DURATION = 1500
const QUALITY_FPS_LOW = 38
const QUALITY_FPS_HIGH = 43
const GPU_QUERY_INTERVAL = 500

const GPU_PROFILE_LABELS = {
  full: 'GPU FULL',
  'no-gtao': 'GPU -AO',
  'no-ssr': 'GPU -SSR',
  'no-ssgi': 'GPU -SSGI',
  base: 'GPU BASE',
} as const

export class App {
  private readonly sizes = new Sizes()
  private readonly preloader = new Preloader()
  private readonly ui = new UI()
  private readonly renderer: Renderer
  private readonly camera: Camera
  private lastRenderTime = performance.now()
  private activeUntil = performance.now() + 6000
  private qualitySampleStart = performance.now()
  private qualityFrameCount = 0
  private nextGpuQueryTime = 0
  private gpuQueryPending = false
  private gpuTime: number | null = null

  private world: World | null = null
  private post: PostProcessing | null = null

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas, this.sizes)
    this.camera = new Camera(canvas, this.sizes)
    canvas.addEventListener('pointerdown', this.markActive, { passive: true })
    canvas.addEventListener('pointermove', this.markPointerActive, {
      passive: true,
    })
    canvas.addEventListener('wheel', this.markActive, { passive: true })
    this.camera.controls.addEventListener('change', this.markActive)
  }

  async init(): Promise<void> {
    // Сначала готовим WebGPU, затем загружаем сцену и постобработку.
    this.preloader.setProgress(0.02)
    await this.renderer.init()
    if (GPU_PROFILE.enabled) this.renderer.setPixelRatio(1.25)
    if (this.renderer.supportsGpuTimestamps()) {
      const label = GPU_PROFILE.enabled
        ? GPU_PROFILE_LABELS[GPU_PROFILE.mode]
        : 'GPU MS'
      this.ui.enableGpuPanel(label)
    }
    this.preloader.setProgress(0.08)

    const loader = new AssetLoader(
      this.renderer.instance,
      (progress) => this.preloader.setProgress(0.08 + progress * 0.9),
    )
    const assets = await loader.load()
    this.world = new World(
      this.renderer.instance,
      assets.bathroom,
      assets.towel,
      assets.environment,
    )
    this.post = new PostProcessing(
      this.renderer.instance,
      this.world.scene,
      this.camera.instance,
      this.world.environmentSource,
      GPU_PROFILE.mode,
    )
    this.preloader.setProgress(0.97)
    await this.renderer.instance.compileAsync(
      this.world.scene,
      this.camera.instance,
    )
    this.post.render()
    this.preloader.setProgress(1)

    this.canvas.classList.add('is-ready')
    await this.preloader.complete()
    this.preloader.dispose()
    this.ui.show()
    this.lastRenderTime = performance.now()
    this.activeUntil = this.lastRenderTime + 6000
    this.qualitySampleStart = this.lastRenderTime
    this.qualityFrameCount = 0
    this.renderer.instance.setAnimationLoop(this.tick)
  }

  private readonly tick = (): void => {
    if (!this.post) return

    const now = performance.now()
    // Во время движения рендерим чаще, в покое снижаем нагрузку.
    const isActive = now < this.activeUntil
    const targetFps = isActive ? ACTIVE_FPS : IDLE_FPS
    const frameInterval = 1000 / targetFps

    if (now - this.lastRenderTime < frameInterval - 0.5) return

    this.ui.begin()
    const elapsed = now - this.lastRenderTime
    this.lastRenderTime =
      elapsed < frameInterval * 2
        ? this.lastRenderTime + frameInterval
        : now
    this.camera.update()
    this.post.render()
    this.updateGpuTime(now)
    this.ui.end(this.renderer.getPixelRatio(), this.gpuTime)
    this.updateAdaptiveQuality(now, isActive)
  }

  private updateGpuTime(now: number): void {
    // Читаем время GPU редко, чтобы замер не создавал лишнюю нагрузку.
    if (
      this.gpuQueryPending ||
      now < this.nextGpuQueryTime ||
      !this.renderer.supportsGpuTimestamps()
    ) {
      return
    }

    this.nextGpuQueryTime = now + GPU_QUERY_INTERVAL
    this.gpuQueryPending = true

    void this.renderer
      .resolveGpuTime()
      .then((duration) => {
        if (duration === null) return
        this.gpuTime =
          this.gpuTime === null
            ? duration
            : this.gpuTime * 0.8 + duration * 0.2
      })
      .finally(() => {
        this.gpuQueryPending = false
      })
  }

  private updateAdaptiveQuality(now: number, isActive: boolean): void {
    if (GPU_PROFILE.enabled) return

    // Режим покоя не должен влиять на оценку качества.
    if (!isActive) {
      this.qualitySampleStart = now
      this.qualityFrameCount = 0
      return
    }

    this.qualityFrameCount++
    const elapsed = now - this.qualitySampleStart
    if (elapsed < QUALITY_SAMPLE_DURATION) return

    const measuredFps = (this.qualityFrameCount * 1000) / elapsed
    const currentScale = this.renderer.getPixelRatio()

    if (measuredFps < QUALITY_FPS_LOW) {
      this.renderer.setPixelRatio(currentScale - 0.1)
    } else if (measuredFps > QUALITY_FPS_HIGH) {
      this.renderer.setPixelRatio(currentScale + 0.05)
    }

    this.qualitySampleStart = now
    this.qualityFrameCount = 0
  }

  private readonly markActive = (): void => {
    this.activeUntil = performance.now() + 1500
  }

  private readonly markPointerActive = (event: PointerEvent): void => {
    if (event.buttons !== 0) this.markActive()
  }

  dispose(): void {
    this.renderer.instance.setAnimationLoop(null)
    this.canvas.removeEventListener('pointerdown', this.markActive)
    this.canvas.removeEventListener('pointermove', this.markPointerActive)
    this.canvas.removeEventListener('wheel', this.markActive)
    this.camera.controls.removeEventListener('change', this.markActive)
    this.camera.dispose()
    this.world?.dispose()
    this.ui.dispose()
    this.preloader.dispose()
    this.renderer.instance.dispose()
  }
}
