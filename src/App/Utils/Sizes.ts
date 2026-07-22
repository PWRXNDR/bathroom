export type ResizeHandler = (width: number, height: number) => void

export class Sizes {
  width = Math.max(window.innerWidth, 1)
  height = Math.max(window.innerHeight, 1)
  readonly devicePixelRatio = Math.max(window.devicePixelRatio || 1, 1)

  private readonly handlers = new Set<ResizeHandler>()
  private readonly onWindowResize = () => {
    this.width = Math.max(window.innerWidth, 1)
    this.height = Math.max(window.innerHeight, 1)

    for (const handler of this.handlers) {
      handler(this.width, this.height)
    }
  }

  constructor() {
    window.addEventListener('resize', this.onWindowResize, { passive: true })
  }

  onResize(handler: ResizeHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  dispose(): void {
    window.removeEventListener('resize', this.onWindowResize)
    this.handlers.clear()
  }
}
