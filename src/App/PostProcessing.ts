import {
  RenderPipeline,
  UnsignedByteType,
  type PerspectiveCamera,
  type Scene,
  type Texture,
  type WebGPURenderer,
} from 'three/webgpu'
import {
  builtinAOContext,
  diffuseColor,
  metalness,
  mrt,
  normalView,
  packNormalToRGB,
  pass,
  roughness,
  sample,
  screenUV,
  unpackRGBToNormal,
  vec2,
  vec4,
  velocity,
} from 'three/tsl'
import { ao, type default as GTAONode } from 'three/addons/tsl/display/GTAONode.js'
import { ssr, type default as SSRNode } from 'three/addons/tsl/display/SSRNode.js'
import { ssgi, type default as SSGINode } from 'three/addons/tsl/display/SSGINode.js'
import { traa } from 'three/addons/tsl/display/TRAANode.js'

export class PostProcessing {
  readonly pipeline: RenderPipeline
  readonly aoPass: GTAONode
  readonly ssrPass: SSRNode
  readonly ssgiPass: SSGINode

  constructor(
    renderer: WebGPURenderer,
    scene: Scene,
    camera: PerspectiveCamera,
    environment: Texture,
  ) {
    const gBuffer = pass(scene, camera)
    gBuffer.transparent = false
    gBuffer.setMRT(
      mrt({
        output: packNormalToRGB(normalView),
        diffuse: diffuseColor,
        metalRough: vec2(metalness, roughness),
        velocity,
      }),
    )

    const packedNormal = gBuffer.getTextureNode('output')
    const depth = gBuffer.getTextureNode('depth')
    const diffuse = gBuffer.getTextureNode('diffuse')
    const metalRough = gBuffer.getTextureNode('metalRough')
    const velocityBuffer = gBuffer.getTextureNode('velocity')
    const normal = sample((uv) =>
      unpackRGBToNormal(packedNormal.sample(uv)),
    )

    gBuffer.getTexture('output').type = UnsignedByteType
    gBuffer.getTexture('diffuse').type = UnsignedByteType
    gBuffer.getTexture('metalRough').type = UnsignedByteType

    this.aoPass = ao(depth, normal, camera)
    this.aoPass.radius.value = 0.22
    this.aoPass.thickness.value = 0.15
    this.aoPass.distanceExponent.value = 1.35
    this.aoPass.distanceFallOff.value = 0.84
    this.aoPass.scale.value = 1.08
    this.aoPass.useTemporalFiltering = true

    const beautyPass = pass(scene, camera)
    beautyPass.contextNode = builtinAOContext(
      this.aoPass.getTextureNode().sample(screenUV).r,
    )
    beautyPass.needsUpdate = true

    const beauty = beautyPass.getTextureNode()

    this.ssrPass = ssr(beauty, depth, normal, {
      camera,
      stochastic: false,
      metalnessNode: metalRough.r.mul(0.92).add(0.08),
      roughnessNode: metalRough.g,
      diffuseNode: diffuse,
      reflectNonMetals: true,
      environmentNode: environment,
      binaryRefine: false,
    })
    this.ssrPass.maxDistance.value = 2.4
    this.ssrPass.thickness.value = 0.085
    this.ssrPass.intensity.value = 0.5
    this.ssrPass.screenEdgeFade.value = 0.18
    this.ssrPass.maxLuminance.value = 3
    this.ssrPass.blurQuality = 1

    this.ssgiPass = ssgi(beauty, depth, normal, camera)
    this.ssgiPass.giIntensity.value = 0.9
    this.ssgiPass.aoIntensity.value = 0
    this.ssgiPass.radius.value = 1.25
    this.ssgiPass.thickness.value = 0.16
    this.ssgiPass.expFactor.value = 1.7
    this.ssgiPass.backfaceLighting.value = 0.04
    this.ssgiPass.useTemporalFiltering = true

    const gi = this.ssgiPass.getGINode()
    const composite = vec4(
      beauty.rgb
        .add(this.ssrPass.rgb)
        .add(diffuse.rgb.mul(gi.rgb).mul(0.4)),
      beauty.a,
    )
    const temporal = traa(composite, depth, velocityBuffer, camera)

    this.pipeline = new RenderPipeline(renderer)
    this.pipeline.outputNode = temporal
  }

  render(): void {
    this.pipeline.render()
  }
}
