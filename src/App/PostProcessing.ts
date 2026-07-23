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
  vec4,
  velocity,
} from 'three/tsl'
import { ao, type default as GTAONode } from 'three/addons/tsl/display/GTAONode.js'
import { ssr, type default as SSRNode } from 'three/addons/tsl/display/SSRNode.js'
import { ssgi, type default as SSGINode } from 'three/addons/tsl/display/SSGINode.js'
import { traa, type default as TRAANode } from 'three/addons/tsl/display/TRAANode.js'
import { sharpen } from 'three/addons/tsl/display/SharpenNode.js'

const AO_CONTRIBUTION = 0.27
const SSR_CONTRIBUTION = 1.03
const DIELECTRIC_BLUR = 2.15
const DIELECTRIC_TEXTURE_BLEND = 0.5
const SSGI_CONTRIBUTION = 0.35
const ROUGH_CONTACT_BOUNCE = 2.1
const SATURATION = 0.88
const SHARPEN = 0.7

export class PostProcessing {
  readonly pipeline: RenderPipeline

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

    const aoPass: GTAONode = ao(depth, normal, camera)
    aoPass.radius.value = 1.51
    aoPass.thickness.value = 0.107
    aoPass.distanceExponent.value = 0.89
    aoPass.distanceFallOff.value = 0.4
    aoPass.scale.value = 0.14
    aoPass.samples.value = 14
    aoPass.resolutionScale = 0.6
    aoPass.useTemporalFiltering = true

    const beautyPass = pass(scene, camera)
    beautyPass.contextNode = builtinAOContext(
      mix(
        1,
        aoPass.getTextureNode().sample(screenUV).r,
        AO_CONTRIBUTION,
      ),
    )
    beautyPass.needsUpdate = true

    const beauty = beautyPass.getTextureNode()
    const dielectricWeight = metalRough.r.oneMinus()
    const ssrRoughness = mix(
      metalRough.g,
      metalRough.g.mul(DIELECTRIC_BLUR).clamp(0, 1),
      dielectricWeight,
    )

    const ssrPass: SSRNode = ssr(beauty, depth, normal, {
      camera,
      stochastic: false,
      metalnessNode: mix(metalRough.b, 1, metalRough.r),
      roughnessNode: ssrRoughness,
      diffuseNode: diffuse,
      reflectNonMetals: true,
      environmentNode: environment,
      binaryRefine: true,
    })
    ssrPass.maxDistance.value = 6.92
    ssrPass.thickness.value = 0.085
    ssrPass.intensity.value = 0.28
    ssrPass.screenEdgeFade.value = 0.339
    ssrPass.maxLuminance.value = 5
    ssrPass.mirrorBias.value = 0.5
    ssrPass.quality.value = 0.65
    ssrPass.resolutionScale = 0.75
    ssrPass.blurQuality = 1

    const ssgiPass: SSGINode = ssgi(beauty, depth, normal, camera)
    ssgiPass.giIntensity.value = 2.4
    ssgiPass.aoIntensity.value = 0
    ssgiPass.radius.value = 1.25
    ssgiPass.thickness.value = 0.08
    ssgiPass.expFactor.value = 1.8
    ssgiPass.backfaceLighting.value = 0.03
    ssgiPass.sliceCount.value = 2
    ssgiPass.stepCount.value = 8
    ssgiPass.useScreenSpaceSampling.value = true
    ssgiPass.useLinearThickness.value = false
    ssgiPass.useTemporalFiltering = true

    const gi = ssgiPass.getGINode()
    const textureBlend = dielectricWeight
      .mul(metalRough.g)
      .mul(DIELECTRIC_TEXTURE_BLEND)
      .clamp(0, 1)
    const roughDielectricWeight = dielectricWeight.mul(metalRough.g)
    const contactBounceScale = mix(
      1,
      ROUGH_CONTACT_BOUNCE,
      roughDielectricWeight,
    )
    const texturedReflection = mix(
      ssrPass.rgb,
      ssrPass.rgb.mul(diffuse.rgb.add(0.2)),
      textureBlend,
    )
    const composite = vec4(
      beauty.rgb
        .add(texturedReflection.mul(SSR_CONTRIBUTION))
        .add(
          diffuse.rgb
            .mul(gi.rgb)
            .mul(SSGI_CONTRIBUTION)
            .mul(contactBounceScale),
        ),
      beauty.a,
    )
    const graded = vec4(
      saturation(composite.rgb, SATURATION),
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
    const taaPass: TRAANode = traa(temporalInput, depth, velocityBuffer, camera)
    taaPass.maxVelocityLength = 32
    taaPass.depthThreshold = 0.0005
    taaPass.edgeDepthDiff = 0.001
    taaPass.useSubpixelCorrection = true
    const filteredTemporal = sharpen(
      taaPass,
      SHARPEN,
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
    const temporalOutput = vec4(
      stableRgb.div(inverseDenominator),
      filteredTemporal.a,
    )

    this.pipeline = new RenderPipeline(renderer)
    this.pipeline.outputNode = temporalOutput
  }

  render(): void {
    this.pipeline.render()
  }
}
