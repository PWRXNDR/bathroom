import type { Renderer } from './Renderer'
import type { PostProcessing } from './PostProcessing'
import {
  QUALITY_PROFILES,
  type QualityLevel,
} from './Utils/Store'

const ORDER: QualityLevel[] = ['low', 'balanced', 'high']

export class AdaptiveQuality {
  private level: QualityLevel = 'high'
  private enabled = false
  private averageFrameMs = 1000 / 45
  private elapsed = 0
  private sampleTime = 0
  private cooldown = 0

  constructor(
    private readonly renderer: Renderer,
    private readonly post: PostProcessing,
  ) {
    this.apply(this.level)
  }

  update(frameSeconds: number): void {
    if (!this.enabled) return

    const frameMs = Math.min(frameSeconds * 1000, 100)
    this.averageFrameMs += (frameMs - this.averageFrameMs) * 0.045
    this.elapsed += frameSeconds
    this.sampleTime += frameSeconds
    this.cooldown = Math.max(this.cooldown - frameSeconds, 0)

    if (this.elapsed < 4 || this.sampleTime < 2.5 || this.cooldown > 0) return

    this.sampleTime = 0
    const fps = 1000 / this.averageFrameMs
    const index = ORDER.indexOf(this.level)

    if (fps < 28 && index > 0) {
      this.apply(ORDER[index - 1])
      this.cooldown = 8
      return
    }

    const balancedIndex = ORDER.indexOf('balanced')
    if (fps > 40 && index < balancedIndex) {
      this.apply(ORDER[index + 1])
      this.cooldown = 12
    }
  }

  getRenderScale(): number {
    return this.renderer.getPixelRatio()
  }

  isEnabled(): boolean {
    return this.enabled
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  getLevel(): QualityLevel {
    return this.level
  }

  setLevel(level: QualityLevel): void {
    this.apply(level)
  }

  private apply(level: QualityLevel): void {
    this.level = level
    const profile = QUALITY_PROFILES[level]

    this.renderer.setPixelRatio(profile.pixelRatio)
    this.post.aoPass.resolutionScale = profile.aoResolution
    this.post.aoPass.samples.value = profile.aoSamples
    this.post.ssrPass.resolutionScale = profile.ssrResolution
    this.post.ssrPass.quality.value = profile.ssrQuality
    this.post.ssgiPass.sliceCount.value = profile.ssgiSlices
    this.post.ssgiPass.stepCount.value = profile.ssgiSteps
  }
}
