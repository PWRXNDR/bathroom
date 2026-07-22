const CIRCUMFERENCE = 2 * Math.PI * 52

export class Preloader {
  private readonly root: HTMLElement
  private readonly ring: SVGCircleElement
  private readonly number: HTMLElement
  private target = 0
  private displayed = 0
  private frame = 0

  constructor() {
    const root = document.querySelector<HTMLElement>('.preloader')
    const ring = document.querySelector<SVGCircleElement>('.preloader__value')
    const number = document.querySelector<HTMLElement>('.preloader__number')

    if (!root || !ring || !number) {
      throw new Error('Preloader markup is incomplete')
    }

    this.root = root
    this.ring = ring
    this.number = number
    this.tick()
  }

  setProgress(progress: number): void {
    this.target = Math.max(this.target, Math.min(progress, 1))
  }

  async complete(): Promise<void> {
    this.target = 1

    await new Promise<void>((resolve) => {
      const wait = () => {
        if (this.displayed >= 0.999) {
          resolve()
          return
        }

        requestAnimationFrame(wait)
      }

      wait()
    })

    this.root.classList.add('is-hidden')
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
  }

  private readonly tick = (): void => {
    const difference = this.target - this.displayed
    this.displayed += difference * (this.target >= 1 ? 0.2 : 0.09)

    if (Math.abs(difference) < 0.001) {
      this.displayed = this.target
    }

    const value = Math.round(this.displayed * 100)
    this.number.textContent = String(value)
    this.ring.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - this.displayed))
    this.frame = requestAnimationFrame(this.tick)
  }
}
