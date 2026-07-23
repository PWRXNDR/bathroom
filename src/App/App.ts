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
      assets.towel,
      assets.environment,
    )
    this.post = new PostProcessing(
      this.renderer.instance,
      this.world.scene,
      this.camera.instance,
      this.world.environmentSource,
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
    this.renderer.instance.setAnimationLoop(this.tick)
  }

  private readonly tick = (): void => {
    if (!this.post) return

    const now = performance.now()
    const isActive = now < this.activeUntil
    const targetFps = isActive ? 45 : 30
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
    this.ui.end(this.renderer.getPixelRatio())
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
