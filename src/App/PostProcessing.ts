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
  float,
  metalness,
  mix,
  mrt,
  normalView,
  packNormalToRGB,
  pass,
  roughness,
  sample,
  saturation,
  screenUV,
  unpackRGBToNormal,
  uniform,
  vec2,
  vec4,
  velocity,
} from 'three/tsl'
import { ao, type default as GTAONode } from 'three/addons/tsl/display/GTAONode.js'
import { ssr, type default as SSRNode } from 'three/addons/tsl/display/SSRNode.js'
import { ssgi, type default as SSGINode } from 'three/addons/tsl/display/SSGINode.js'
import { traa, type default as TRAANode } from 'three/addons/tsl/display/TRAANode.js'
import { sharpen } from 'three/addons/tsl/display/SharpenNode.js'

export class PostProcessing {
  readonly pipeline: RenderPipeline
  readonly aoPass: GTAONode
  readonly ssrPass: SSRNode
  readonly ssgiPass: SSGINode
  readonly taaPass: TRAANode
  private readonly aoContribution = uniform(0.27)
  private readonly ssrContribution = uniform(1.03)
  private readonly ssgiContribution = uniform(0.18)
  private readonly saturationAmount = uniform(0.88)
  private readonly sharpenAmount = uniform(0.7)
  private readonly temporalOutput: ReturnType<typeof vec4>
  private readonly directOutput: ReturnType<typeof vec4>
  private taaEnabled = true

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
    this.aoPass.radius.value = 1.51
    this.aoPass.thickness.value = 0.107
    this.aoPass.distanceExponent.value = 0.89
    this.aoPass.distanceFallOff.value = 0.4
    this.aoPass.scale.value = 0.14
    this.aoPass.samples.value = 14
    this.aoPass.resolutionScale = 0.6
    this.aoPass.useTemporalFiltering = true

    const beautyPass = pass(scene, camera)
    beautyPass.contextNode = builtinAOContext(
      mix(
        1,
        this.aoPass.getTextureNode().sample(screenUV).r,
        this.aoContribution,
      ),
    )
    beautyPass.needsUpdate = true

    const beauty = beautyPass.getTextureNode()

    this.ssrPass = ssr(beauty, depth, normal, {
      camera,
      stochastic: false,
      metalnessNode: mix(
        metalRough.g.oneMinus().pow(2).mul(0.04),
        1,
        metalRough.r,
      ),
      roughnessNode: metalRough.g,
      diffuseNode: diffuse,
      reflectNonMetals: true,
      environmentNode: environment,
      binaryRefine: false,
    })
    this.ssrPass.maxDistance.value = 6.92
    this.ssrPass.thickness.value = 0.085
    this.ssrPass.intensity.value = 0.28
    this.ssrPass.screenEdgeFade.value = 0.339
    this.ssrPass.maxLuminance.value = 5
    this.ssrPass.mirrorBias.value = 0.5
    this.ssrPass.quality.value = 0.46
    this.ssrPass.resolutionScale = 0.5
    this.ssrPass.blurQuality = 1

    this.ssgiPass = ssgi(beauty, depth, normal, camera)
    this.ssgiPass.giIntensity.value = 0.72
    this.ssgiPass.aoIntensity.value = 0
    this.ssgiPass.radius.value = 0.9
    this.ssgiPass.thickness.value = 0.1
    this.ssgiPass.expFactor.value = 1.7
    this.ssgiPass.backfaceLighting.value = 0.04
    this.ssgiPass.sliceCount.value = 2
    this.ssgiPass.stepCount.value = 8
    this.ssgiPass.useScreenSpaceSampling.value = true
    this.ssgiPass.useLinearThickness.value = false
    this.ssgiPass.useTemporalFiltering = true

    const gi = this.ssgiPass.getGINode()
    const composite = vec4(
      beauty.rgb
        .add(this.ssrPass.rgb.mul(this.ssrContribution))
        .add(diffuse.rgb.mul(gi.rgb).mul(this.ssgiContribution)),
      beauty.a,
    )
    const graded = vec4(
      saturation(composite.rgb, this.saturationAmount),
      composite.a,
    )
    const temporalInputRgb = graded.rgb.max(0)
    const temporalPeak = temporalInputRgb.r
      .max(temporalInputRgb.g)
      .max(temporalInputRgb.b)
    const temporalInput = vec4(
      temporalInputRgb.div(temporalPeak.add(1)),
      graded.a,
    )
    this.taaPass = traa(temporalInput, depth, velocityBuffer, camera)
    this.taaPass.maxVelocityLength = 32
    this.taaPass.depthThreshold = 0.0005
    this.taaPass.edgeDepthDiff = 0.001
    this.taaPass.useSubpixelCorrection = true
    const filteredTemporal = sharpen(
      this.taaPass,
      this.sharpenAmount,
      true,
    )
    const filteredRgb = filteredTemporal.rgb.max(0)
    const filteredPeak = filteredRgb.r
      .max(filteredRgb.g)
      .max(filteredRgb.b)
    const stablePeak = filteredPeak.min(0.98)
    const stableRgb = filteredRgb.mul(
      stablePeak.div(filteredPeak.max(0.000001)),
    )
    const inverseDenominator = float(1)
      .sub(stablePeak)
      .max(0.02)
    this.temporalOutput = vec4(
      stableRgb.div(inverseDenominator),
      filteredTemporal.a,
    )
    const filteredDirect = sharpen(
      temporalInput,
      this.sharpenAmount,
      true,
    )
    const directRgb = filteredDirect.rgb.max(0)
    const directPeak = directRgb.r.max(directRgb.g).max(directRgb.b)
    const stableDirectPeak = directPeak.min(0.98)
    const stableDirectRgb = directRgb.mul(
      stableDirectPeak.div(directPeak.max(0.000001)),
    )
    const directInverseDenominator = float(1)
      .sub(stableDirectPeak)
      .max(0.02)
    this.directOutput = vec4(
      stableDirectRgb.div(directInverseDenominator),
      filteredDirect.a,
    )

    this.pipeline = new RenderPipeline(renderer)
    this.pipeline.outputNode = this.temporalOutput
  }

  render(): void {
    this.pipeline.render()
  }

  isTaaEnabled(): boolean {
    return this.taaEnabled
  }

  setTaaEnabled(enabled: boolean): void {
    if (this.taaEnabled === enabled) return

    this.taaEnabled = enabled
    this.pipeline.outputNode = enabled
      ? this.temporalOutput
      : this.directOutput
    this.pipeline.needsUpdate = true
  }

  refreshPipeline(): void {
    this.pipeline.needsUpdate = true
  }

  getAoContribution(): number {
    return this.aoContribution.value
  }

  setAoContribution(value: number): void {
    this.aoContribution.value = value
  }

  getSsrContribution(): number {
    return this.ssrContribution.value
  }

  setSsrContribution(value: number): void {
    this.ssrContribution.value = value
  }

  getSsgiContribution(): number {
    return this.ssgiContribution.value
  }

  setSsgiContribution(value: number): void {
    this.ssgiContribution.value = value
  }

  getSaturation(): number {
    return this.saturationAmount.value
  }

  setSaturation(value: number): void {
    this.saturationAmount.value = value
  }

  getSharpenAmount(): number {
    return this.sharpenAmount.value
  }

  setSharpenAmount(value: number): void {
    this.sharpenAmount.value = value
  }
}
