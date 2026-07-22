import {
  Color,
  EquirectangularReflectionMapping,
  Euler,
  PMREMGenerator,
  RectAreaLight,
  RectAreaLightNode,
  Scene,
  SpotLight,
  Vector3,
  type DataTexture,
  type RenderTarget,
  type WebGPURenderer,
} from 'three/webgpu'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { RectAreaLightTexturesLib } from 'three/addons/lights/RectAreaLightTexturesLib.js'
import { Bathroom } from './Bathroom'

export class World {
  readonly scene = new Scene()
  readonly bathroom: Bathroom
  readonly environmentTarget: RenderTarget

  constructor(
    renderer: WebGPURenderer,
    bathroomAsset: GLTF,
    readonly environmentSource: DataTexture,
  ) {
    RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init())
    this.scene.background = new Color(0x090909)
    this.scene.environmentIntensity = 0.28
    this.scene.environmentRotation = new Euler(0, Math.PI * 0.16, 0)

    environmentSource.mapping = EquirectangularReflectionMapping
    const pmrem = new PMREMGenerator(renderer)
    this.environmentTarget = pmrem.fromEquirectangular(environmentSource)
    this.scene.environment = this.environmentTarget.texture
    pmrem.dispose()

    this.bathroom = new Bathroom(this.scene, bathroomAsset)
    this.addLights()
  }

  dispose(): void {
    this.environmentTarget.dispose()
    this.environmentSource.dispose()
  }

  private addLights(): void {
    const practicalColor = 0xffe9d2
    const strip = new RectAreaLight(practicalColor, 38, 1.845, 0.079)
    strip.name = 'Ceiling strip'
    strip.position.set(3.676, 2.815, -2.591)
    strip.lookAt(new Vector3(3.676, 0, -2.591))
    this.scene.add(strip)

    const spots = [
      [3.226, -3.532],
      [4.126, -3.532],
      [3.226, -4.846],
      [4.126, -4.846],
    ] as const

    spots.forEach(([x, z], index) => {
      const spot = new SpotLight(practicalColor, 112, 4.5, 0.56, 0.76, 2)
      spot.name = `Ceiling spot ${index + 1}`
      spot.position.set(x, 2.8, z)
      spot.target.position.set(x, 0, z - 0.08)
      spot.castShadow = true
      spot.shadow.mapSize.set(512, 512)
      spot.shadow.camera.near = 0.08
      spot.shadow.bias = -0.00012
      spot.shadow.normalBias = 0.004
      spot.shadow.radius = 2.2
      spot.shadow.intensity = 0.82
      spot.shadow.autoUpdate = false
      spot.shadow.needsUpdate = true

      this.scene.add(spot, spot.target)
    })

    const mirrorLights = [2.999, 4.353]
    mirrorLights.forEach((x, index) => {
      const light = new RectAreaLight(practicalColor, 14, 0.035, 1.16)
      light.name = `Mirror light ${index + 1}`
      light.position.set(x, 1.62, -2.045)
      light.lookAt(new Vector3(x, 1.35, -4.2))
      this.scene.add(light)
    })
  }
}
