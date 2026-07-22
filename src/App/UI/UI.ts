import Stats from 'stats.js'

export class UI {
  private readonly root = document.createElement('div')
  private readonly fps = new Stats()
  private readonly ms = new Stats()
  private readonly quality = new Stats()
  private readonly qualityPanel: Stats.Panel

  constructor() {
    this.root.className = 'stats-stack'

    this.fps.showPanel(0)
    this.ms.showPanel(1)
    this.qualityPanel = this.quality.addPanel(
      new Stats.Panel('SCALE', '#fd8', '#231'),
    )
    this.quality.showPanel(3)

    this.root.append(this.fps.dom, this.ms.dom, this.quality.dom)
    document.body.append(this.root)
  }

  begin(): void {
    this.fps.begin()
    this.ms.begin()
  }

  end(renderScale: number): void {
    this.fps.end()
    this.ms.end()
    this.qualityPanel.update(Math.round(renderScale * 100), 150)
  }

  show(): void {
    this.root.classList.add('is-visible')
  }

  dispose(): void {
    this.root.remove()
  }
}
