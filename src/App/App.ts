import { AdaptiveQuality } from './AdaptiveQuality'
import { Camera } from './Camera'
import { PostProcessing } from './PostProcessing'
import { Renderer } from './Renderer'
import { UI } from './UI/UI'
import { Preloader } from './UI/Preloader'
import { AssetLoader } from './Utils/AssetLoader'
import { AssetStore } from './Utils/AssetStore'
import { Sizes } from './Utils/Sizes'
import { World } from './World/World'

export class App {
  private readonly sizes = new Sizes()
  private readonly assets = new AssetStore()
  private readonly preloader = new Preloader()
  private readonly ui = new UI()
  private readonly renderer: Renderer
  private readonly camera: Camera
  private lastRenderTime = performance.now()
  private activeUntil = performance.now() + 6000

  private world: World | null = null
  private post: PostProcessing | null = null
  private quality: AdaptiveQuality | null = null

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas, this.sizes)
    this.camera = new Camera(canvas, this.sizes)
    this.camera.controls.addEventListener('change', this.markActive)
  }

  async init(): Promise<void> {
    this.preloader.setProgress(0.02)
    await this.renderer.init()
    this.preloader.setProgress(0.08)

    const loader = new AssetLoader(
      this.renderer.instance,
      (progress) => this.preloader.setProgress(0.08 + progress * 0.9),
    )
    this.assets.set(await loader.load())

    const assets = this.assets.get()
    this.world = new World(
      this.renderer.instance,
      assets.bathroom,
      assets.environment,
    )
    this.post = new PostProcessing(
      this.renderer.instance,
      this.world.scene,
      this.camera.instance,
      this.world.environmentSource,
    )
    this.quality = new AdaptiveQuality(this.renderer, this.post, this.sizes)

    this.preloader.setProgress(0.97)
    await this.renderer.instance.compileAsync(
      this.world.scene,
      this.camera.instance,
    )
    this.post.render()
    this.preloader.setProgress(1)

    this.canvas.classList.add('is-ready')
    await this.preloader.complete()
    this.ui.show()
    this.lastRenderTime = performance.now()
    this.activeUntil = this.lastRenderTime + 6000
    this.renderer.instance.setAnimationLoop(this.tick)
  }

  private readonly tick = (): void => {
    if (!this.post || !this.quality) return

    const now = performance.now()
    const isActive = now < this.activeUntil
    const targetFps = isActive ? 60 : 30
    const frameInterval = 1000 / targetFps

    if (now - this.lastRenderTime < frameInterval - 0.5) return

    this.ui.begin()
    const elapsed = now - this.lastRenderTime
    const delta = Math.min(elapsed / 1000, 0.1)
    this.lastRenderTime =
      elapsed < frameInterval * 2
        ? this.lastRenderTime + frameInterval
        : now
    this.camera.update()
    if (isActive) this.quality.update(delta)
    this.post.render()
    this.ui.end(this.quality.getRenderScale())
  }

  private readonly markActive = (): void => {
    this.activeUntil = performance.now() + 1500
  }
}
