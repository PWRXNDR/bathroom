import {
  AmbientLight,
  Color,
  EquirectangularReflectionMapping,
  Euler,
  PMREMGenerator,
  Scene,
  SpotLight,
  type DataTexture,
  type RenderTarget,
  type WebGPURenderer,
} from 'three/webgpu'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { Bathroom } from './Bathroom'

export class World {
  readonly scene = new Scene()
  private readonly environmentTarget: RenderTarget

  constructor(
    renderer: WebGPURenderer,
    bathroomAsset: GLTF,
    towelAsset: GLTF,
    readonly environmentSource: DataTexture,
  ) {
    this.scene.background = new Color(0x090909)
    this.scene.environmentIntensity = 0.18
    this.scene.environmentRotation = new Euler(0, 0, 0)

    environmentSource.mapping = EquirectangularReflectionMapping
    const pmrem = new PMREMGenerator(renderer)
    this.environmentTarget = pmrem.fromEquirectangular(environmentSource)
    this.scene.environment = this.environmentTarget.texture
    pmrem.dispose()

    new Bathroom(
      this.scene,
      bathroomAsset,
      towelAsset,
      this.environmentTarget.texture,
      Math.min(renderer.getMaxAnisotropy(), 8),
    )
    this.addLights()
  }

  dispose(): void {
    this.environmentTarget.dispose()
    this.environmentSource.dispose()
  }

  private addLights(): void {
    const ambient = new AmbientLight(0xdde1e6, 0.2)
    ambient.name = 'Reference ambient fill'
    this.scene.add(ambient)

    const spots = [
      {
        color: 0xfefef6,
        position: [
          3.486985882664326,
          3.3489054066360833,
          -3.7170669563382495,
        ],
        target: [
          3.5322095311166053,
          1.817958546163197,
          -3.5387060473660896,
        ],
        intensity: 61.4,
        distance: 6.95,
        angle: 0.9599310885968813,
        penumbra: 1,
        decay: 2.26,
        shadow: {
          bias: -0.00165,
          normalBias: 0.0093,
          radius: 3.2,
          intensity: 0.67,
          mapSize: [1024, 1024],
        },
      },
      {
        color: 0xfeeed7,
        position: [
          3.8618366870127563,
          2.780810804474475,
          -4.716,
        ],
        target: [
          3.7951539025808856,
          1.8124523115631201,
          -4.97941458507683,
        ],
        intensity: 7.7,
        distance: 5.01,
        angle: 1.4556045961632709,
        penumbra: 1,
        decay: 0.65,
        shadow: {
          bias: -0.00032,
          normalBias: 0.0142,
          radius: 4.1,
          intensity: 0.68,
          mapSize: [1024, 1024],
        },
      },
      {
        color: 0xffffff,
        position: [
          3.7617430936557685,
          2.7749349005897272,
          -3.3534067094661424,
        ],
        target: [
          3.60485078316161,
          1.7704262104584898,
          -2.6644853556557,
        ],
        intensity: 30,
        distance: 4.69,
        angle: 1.0088003076527223,
        penumbra: 1,
        decay: 2,
        shadow: {
          bias: -0.0001,
          normalBias: 0.004,
          radius: 4,
          intensity: 1,
          mapSize: [1024, 1024],
        },
      },
    ] as const

    spots.forEach((settings, index) => {
      const [x, y, z] = settings.position
      const [targetX, targetY, targetZ] = settings.target
      const spot = new SpotLight(
        settings.color,
        settings.intensity,
        settings.distance,
        settings.angle,
        settings.penumbra,
        settings.decay,
      )
      spot.name = `Reference spot ${index + 1}`
      spot.position.set(x, y, z)
      spot.target.position.set(targetX, targetY, targetZ)
      spot.castShadow = true
      spot.shadow.mapSize.set(...settings.shadow.mapSize)
      spot.shadow.camera.near = 0.08
      spot.shadow.bias = settings.shadow.bias
      spot.shadow.normalBias = settings.shadow.normalBias
      spot.shadow.radius = settings.shadow.radius
      spot.shadow.intensity = settings.shadow.intensity
      spot.shadow.autoUpdate = false
      spot.shadow.needsUpdate = true

      this.scene.add(spot, spot.target)
    })
  }
}
