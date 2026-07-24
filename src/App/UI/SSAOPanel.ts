import GUI from 'lil-gui'
import type { PostProcessing } from '../PostProcessing'
import type { Renderer } from '../Renderer'
import type { World } from '../World/World'

interface SSAOState {
  contribution: number
  radius: number
  thickness: number
  distanceExponent: number
  distanceFallOff: number
  scale: number
  samples: number
  resolutionScale: number
  temporalFiltering: boolean
}

interface LightingState {
  ambientIntensity: number
  environmentIntensity: number
  exposure: number
  spot1Intensity: number
  spot1ShadowIntensity: number
  spot1ShadowRadius: number
  spot2Intensity: number
  spot2ShadowIntensity: number
  spot2ShadowRadius: number
  spot3Intensity: number
  spot3ShadowIntensity: number
  spot3ShadowRadius: number
}

export class SSAOPanel {
  private readonly gui = new GUI({ title: 'Scene tuning' })
  private readonly ssao: SSAOState
  private readonly lighting: LightingState

  constructor(
    post: PostProcessing,
    world: World,
    renderer: Renderer,
    onChange: () => void,
  ) {
    const pass = post.aoPass
    this.ssao = {
      contribution: post.getAoContribution(),
      radius: pass.radius.value,
      thickness: pass.thickness.value,
      distanceExponent: pass.distanceExponent.value,
      distanceFallOff: pass.distanceFallOff.value,
      scale: pass.scale.value,
      samples: pass.samples.value,
      resolutionScale: pass.resolutionScale,
      temporalFiltering: pass.useTemporalFiltering,
    }

    const [spot1, spot2, spot3] = world.spotLights
    this.lighting = {
      ambientIntensity: world.ambientLight.intensity,
      environmentIntensity: world.scene.environmentIntensity,
      exposure: renderer.instance.toneMappingExposure,
      spot1Intensity: spot1.intensity,
      spot1ShadowIntensity: spot1.shadow.intensity,
      spot1ShadowRadius: spot1.shadow.radius,
      spot2Intensity: spot2.intensity,
      spot2ShadowIntensity: spot2.shadow.intensity,
      spot2ShadowRadius: spot2.shadow.radius,
      spot3Intensity: spot3.intensity,
      spot3ShadowIntensity: spot3.shadow.intensity,
      spot3ShadowRadius: spot3.shadow.radius,
    }

    const ssaoFolder = this.gui.addFolder('SSAO / GTAO')
    ssaoFolder
      .add(this.ssao, 'contribution', 0, 2, 0.001)
      .name('Contribution')
      .onChange((value: number) => {
        post.setAoContribution(value)
        onChange()
      })
    ssaoFolder
      .add(this.ssao, 'radius', 0, 5, 0.001)
      .name('Radius')
      .onChange((value: number) => {
        pass.radius.value = value
        onChange()
      })
    ssaoFolder
      .add(this.ssao, 'thickness', 0, 0.5, 0.001)
      .name('Thickness')
      .onChange((value: number) => {
        pass.thickness.value = value
        onChange()
      })
    ssaoFolder
      .add(this.ssao, 'distanceExponent', 0.1, 4, 0.01)
      .name('Distance exponent')
      .onChange((value: number) => {
        pass.distanceExponent.value = value
        onChange()
      })
    ssaoFolder
      .add(this.ssao, 'distanceFallOff', 0, 1, 0.01)
      .name('Distance falloff')
      .onChange((value: number) => {
        pass.distanceFallOff.value = value
        onChange()
      })
    ssaoFolder
      .add(this.ssao, 'scale', 0.01, 2, 0.01)
      .name('Scale')
      .onChange((value: number) => {
        pass.scale.value = value
        onChange()
      })
    ssaoFolder
      .add(this.ssao, 'samples', 1, 32, 1)
      .name('Samples')
      .onChange((value: number) => {
        pass.samples.value = value
        onChange()
      })
    ssaoFolder
      .add(this.ssao, 'resolutionScale', 0.1, 1, 0.01)
      .name('Resolution scale')
      .onChange((value: number) => {
        pass.resolutionScale = value
        onChange()
      })
    ssaoFolder
      .add(this.ssao, 'temporalFiltering')
      .name('Temporal filtering')
      .onChange((value: boolean) => {
        pass.useTemporalFiltering = value
        onChange()
      })

    const shadowFolder = this.gui.addFolder('Lighting & shadow depth')
    shadowFolder
      .add(this.lighting, 'ambientIntensity', 0, 1, 0.001)
      .name('Ambient fill')
      .onChange((value: number) => {
        world.ambientLight.intensity = value
        onChange()
      })
    shadowFolder
      .add(this.lighting, 'environmentIntensity', 0, 2, 0.001)
      .name('IBL intensity')
      .onChange((value: number) => {
        world.scene.environmentIntensity = value
        onChange()
      })
    shadowFolder
      .add(this.lighting, 'exposure', 0.1, 2, 0.001)
      .name('Exposure')
      .onChange((value: number) => {
        renderer.instance.toneMappingExposure = value
        onChange()
      })

    world.spotLights.forEach((spot, index) => {
      const number = index + 1
      const intensityKey = `spot${number}Intensity` as keyof LightingState
      const shadowKey = `spot${number}ShadowIntensity` as keyof LightingState
      const radiusKey = `spot${number}ShadowRadius` as keyof LightingState
      const folder = shadowFolder.addFolder(`Spot ${number}`)

      folder
        .add(this.lighting, intensityKey, 0, 100, 0.1)
        .name('Light intensity')
        .onChange((value: number) => {
          spot.intensity = value
          onChange()
        })
      folder
        .add(this.lighting, shadowKey, 0, 1, 0.001)
        .name('Shadow intensity')
        .onChange((value: number) => {
          spot.shadow.intensity = value
          onChange()
        })
      folder
        .add(this.lighting, radiusKey, 0, 10, 0.1)
        .name('Shadow blur')
        .onChange((value: number) => {
          spot.shadow.radius = value
          spot.shadow.needsUpdate = true
          onChange()
        })
    })

    this.gui
      .add({ copy: () => this.copy() }, 'copy')
      .name('Copy tuning params')
  }

  dispose(): void {
    this.gui.destroy()
  }

  private async copy(): Promise<void> {
    await navigator.clipboard.writeText(
      JSON.stringify(
        {
          ssao: this.ssao,
          lighting: this.lighting,
        },
        null,
        2,
      ),
    )
  }
}
