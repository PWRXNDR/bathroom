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
  luminance,
  materialClearcoat,
  materialClearcoatRoughness,
  materialIOR,
  materialSpecularColor,
  materialSpecularIntensity,
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
  private readonly dielectricBlur = uniform(2.15)
  private readonly dielectricTextureBlend = uniform(0.5)
  private readonly ssgiContribution = uniform(0.35)
  private readonly roughContactBounce = uniform(2.1)
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
    const clearcoatWeight = materialClearcoat.clamp(0, 1)
    const dielectricF0 = materialIOR
      .sub(1)
      .div(materialIOR.add(1))
      .pow(2)
      .mul(materialSpecularIntensity)
      .mul(luminance(materialSpecularColor))
      .clamp(0, 1)
    const specularResponse = dielectricF0
      .add(float(0.04).mul(clearcoatWeight).mul(dielectricF0.oneMinus()))
      .clamp(0, 1)
    const reflectionRoughness = mix(
      roughness,
      materialClearcoatRoughness,
      clearcoatWeight,
    )

    const gBuffer = pass(scene, camera)
    gBuffer.transparent = false
    gBuffer.setMRT(
      mrt({
        output: packNormalToRGB(normalView),
        diffuse: diffuseColor,
        // B stores dielectric F0 so rough non-metals can receive SSR.
        metalRough: vec4(
          metalness,
          reflectionRoughness,
          specularResponse,
          clearcoatWeight,
        ),
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
    const dielectricWeight = metalRough.r.oneMinus()
    const ssrRoughness = mix(
      metalRough.g,
      metalRough.g.mul(this.dielectricBlur).clamp(0, 1),
      dielectricWeight,
    )

    this.ssrPass = ssr(beauty, depth, normal, {
      camera,
      stochastic: false,
      metalnessNode: mix(metalRough.b, 1, metalRough.r),
      roughnessNode: ssrRoughness,
      diffuseNode: diffuse,
      reflectNonMetals: true,
      environmentNode: environment,
      binaryRefine: true,
    })
    this.ssrPass.maxDistance.value = 6.92
    this.ssrPass.thickness.value = 0.085
    this.ssrPass.intensity.value = 0.28
    this.ssrPass.screenEdgeFade.value = 0.339
    this.ssrPass.maxLuminance.value = 5
    this.ssrPass.mirrorBias.value = 0.5
    this.ssrPass.quality.value = 0.65
    this.ssrPass.resolutionScale = 0.75
    this.ssrPass.blurQuality = 1

    this.ssgiPass = ssgi(beauty, depth, normal, camera)
    this.ssgiPass.giIntensity.value = 2.4
    this.ssgiPass.aoIntensity.value = 0
    this.ssgiPass.radius.value = 1.25
    this.ssgiPass.thickness.value = 0.08
    this.ssgiPass.expFactor.value = 1.8
    this.ssgiPass.backfaceLighting.value = 0.03
    this.ssgiPass.sliceCount.value = 2
    this.ssgiPass.stepCount.value = 8
    this.ssgiPass.useScreenSpaceSampling.value = true
    this.ssgiPass.useLinearThickness.value = false
    this.ssgiPass.useTemporalFiltering = true

    const gi = this.ssgiPass.getGINode()
    const textureBlend = dielectricWeight
      .mul(metalRough.g)
      .mul(this.dielectricTextureBlend)
      .clamp(0, 1)
    const roughDielectricWeight = dielectricWeight.mul(metalRough.g)
    const contactBounceScale = mix(
      1,
      this.roughContactBounce,
      roughDielectricWeight,
    )
    const texturedReflection = mix(
      this.ssrPass.rgb,
      this.ssrPass.rgb.mul(diffuse.rgb.add(0.2)),
      textureBlend,
    )
    const composite = vec4(
      beauty.rgb
        .add(texturedReflection.mul(this.ssrContribution))
        .add(
          diffuse.rgb
            .mul(gi.rgb)
            .mul(this.ssgiContribution)
            .mul(contactBounceScale),
        ),
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
    this.updateOutputNode()
  }

  private updateOutputNode(): void {
    this.pipeline.outputNode = this.taaEnabled
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

  getDielectricBlur(): number {
    return this.dielectricBlur.value
  }

  setDielectricBlur(value: number): void {
    this.dielectricBlur.value = value
  }

  getDielectricTextureBlend(): number {
    return this.dielectricTextureBlend.value
  }

  setDielectricTextureBlend(value: number): void {
    this.dielectricTextureBlend.value = value
  }

  getSsgiContribution(): number {
    return this.ssgiContribution.value
  }

  setSsgiContribution(value: number): void {
    this.ssgiContribution.value = value
  }

  getRoughContactBounce(): number {
    return this.roughContactBounce.value
  }

  setRoughContactBounce(value: number): void {
    this.roughContactBounce.value = value
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
