import {
  DoubleSide,
  Euler,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Scene,
  type Texture,
} from 'three/webgpu'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'

export type SurfaceMaterial = MeshStandardMaterial | MeshPhysicalMaterial

interface MaterialTuning {
  color: string
  roughness: number
  metalness: number
  localEnvironment: boolean
  envMapIntensity: number
  opacity: number
  transparent: boolean
  depthWrite: boolean
  emissive: string
  emissiveIntensity: number
  normalScale?: [number, number]
  aoIntensity?: number
  transmission?: number
  ior?: number
  thickness?: number
  clearcoat?: number
  clearcoatRoughness?: number
  specularIntensity?: number
  specularColor?: string
}

const MATERIAL_TUNING: Record<string, MaterialTuning> = {
  mirror: {
    color: '#696969',
    roughness: 0,
    metalness: 1,
    normalScale: [1, -1],
    aoIntensity: 1,
    localEnvironment: true,
    envMapIntensity: 0.18,
    opacity: 1,
    transparent: false,
    depthWrite: true,
    emissive: '#000000',
    emissiveIntensity: 1,
  },
  cream_ceramic: {
    color: '#f2f2f2',
    roughness: 0.344,
    metalness: 0.516,
    normalScale: [1, -1],
    aoIntensity: 1,
    localEnvironment: true,
    envMapIntensity: 0.153,
    opacity: 1,
    transparent: false,
    depthWrite: true,
    emissive: '#000000',
    emissiveIntensity: 1,
    transmission: 0,
    ior: 1000,
    thickness: 0,
    clearcoat: 0,
    clearcoatRoughness: 0,
    specularIntensity: 1,
    specularColor: '#ffffff',
  },
  'r4371-mountain-oak-dunkel-b': {
    color: '#ffffff',
    roughness: 0.94,
    metalness: 0.917,
    normalScale: [1, -1],
    aoIntensity: 1,
    localEnvironment: false,
    envMapIntensity: 1,
    opacity: 1,
    transparent: false,
    depthWrite: true,
    emissive: '#000000',
    emissiveIntensity: 1,
    transmission: 0,
    ior: 1000,
    thickness: 0,
    clearcoat: 0,
    clearcoatRoughness: 0,
    specularIntensity: 1,
    specularColor: '#ffffff',
  },
  textile_vinyl_textured_blue_grey1: {
    color: '#ffffff',
    roughness: 1,
    metalness: 0,
    normalScale: [1, -1],
    aoIntensity: 1,
    localEnvironment: true,
    envMapIntensity: 0.748,
    opacity: 1,
    transparent: false,
    depthWrite: true,
    emissive: '#000000',
    emissiveIntensity: 1,
    transmission: 0,
    ior: 1,
    thickness: 0,
    clearcoat: 0,
    clearcoatRoughness: 0,
    specularIntensity: 1,
    specularColor: '#ffffff',
  },
  material_11: {
    color: '#ffffff',
    roughness: 1,
    metalness: 0,
    normalScale: [1, -1],
    aoIntensity: 1,
    localEnvironment: true,
    envMapIntensity: 1.125,
    opacity: 1,
    transparent: false,
    depthWrite: true,
    emissive: '#000000',
    emissiveIntensity: 1,
    transmission: 0,
    ior: 1000,
    thickness: 0,
    clearcoat: 0,
    clearcoatRoughness: 0,
    specularIntensity: 1,
    specularColor: '#000000',
  },
  '101219dc0000000000045104_370x275_b': {
    color: '#ffffff',
    roughness: 0.909,
    metalness: 0,
    normalScale: [1, -1],
    aoIntensity: 1,
    localEnvironment: false,
    envMapIntensity: 1,
    opacity: 1,
    transparent: false,
    depthWrite: true,
    emissive: '#000000',
    emissiveIntensity: 1,
    transmission: 0,
    ior: 1000,
    thickness: 0,
    clearcoat: 0,
    clearcoatRoughness: 0,
    specularIntensity: 1,
    specularColor: '#414141',
  },
  chrome_blurry: {
    color: '#cfd3d5',
    roughness: 0.414,
    metalness: 1,
    normalScale: [1, -1],
    aoIntensity: 1,
    localEnvironment: true,
    envMapIntensity: 0.18,
    opacity: 1,
    transparent: false,
    depthWrite: true,
    emissive: '#000000',
    emissiveIntensity: 1,
    transmission: 0,
    ior: 1.5,
    thickness: 0,
    clearcoat: 0,
    clearcoatRoughness: 0,
    specularIntensity: 0.55,
    specularColor: '#ffffff',
  },
  'black-hammertone-301x300bijgewerkt': {
    color: '#25282a',
    roughness: 0.053,
    metalness: 0.893,
    normalScale: [1, -1],
    aoIntensity: 1,
    localEnvironment: true,
    envMapIntensity: 0.395,
    opacity: 1,
    transparent: false,
    depthWrite: true,
    emissive: '#000000',
    emissiveIntensity: 1,
    transmission: 0,
    ior: 1.5,
    thickness: 0,
    clearcoat: 0,
    clearcoatRoughness: 0,
    specularIntensity: 0.55,
    specularColor: '#ffffff',
  },
  '2011.14_highres': {
    color: '#ffffff',
    roughness: 0.359,
    metalness: 0.022,
    normalScale: [1, -1],
    aoIntensity: 1,
    localEnvironment: true,
    envMapIntensity: 0.701,
    opacity: 1,
    transparent: false,
    depthWrite: true,
    emissive: '#000000',
    emissiveIntensity: 1,
    transmission: 0,
    ior: 1.5,
    thickness: 0,
    clearcoat: 0,
    clearcoatRoughness: 0,
    specularIntensity: 0.55,
    specularColor: '#ffffff',
  },
  '88775-bl-b1': {
    color: '#ffffff',
    roughness: 0.179,
    metalness: 0,
    normalScale: [1, -1],
    aoIntensity: 1,
    localEnvironment: true,
    envMapIntensity: 1,
    opacity: 1,
    transparent: false,
    depthWrite: true,
    emissive: '#000000',
    emissiveIntensity: 1,
    transmission: 0,
    ior: 1.5,
    thickness: 0,
    clearcoat: 0,
    clearcoatRoughness: 0,
    specularIntensity: 0.55,
    specularColor: '#ffffff',
  },
}

const POLISHED_ROUGHNESS = 0.02
const BATHROOM_EXPORT_OFFSET_X = 3.59949

export class Bathroom {
  readonly model: Object3D
  private readonly environmentMaterials = new Set<SurfaceMaterial>()

  constructor(
    scene: Scene,
    gltf: GLTF,
    towelGltf: GLTF,
    private readonly environment: Texture,
    private readonly textureAnisotropy: number,
  ) {
    this.model = new Group()
    this.model.name = 'Bathroom assets'
    gltf.scene.position.x += BATHROOM_EXPORT_OFFSET_X
    this.model.add(gltf.scene, towelGltf.scene)
    this.prepareMaterials()
    scene.add(this.model)
  }

  private prepareMaterials(): void {
    const prepared = new Set<SurfaceMaterial>()

    this.model.traverse((child) => {
      if (!(child instanceof Mesh)) return

      child.castShadow = true
      child.receiveShadow = true

      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material]

      const isShowerGlass = materials.some((material) =>
        material.name.toLowerCase().includes('glass_pure'),
      )
      const isLightDiffuser = materials.some((material) => {
        const name = material.name.toLowerCase()
        return name.includes('vidro_difusor')
      })
      if (isShowerGlass) {
        child.castShadow = false
        child.receiveShadow = true
      } else if (isLightDiffuser) {
        child.castShadow = false
        child.receiveShadow = false
      }

      for (const material of materials) {
        if (
          !(material instanceof MeshStandardMaterial) ||
          prepared.has(material)
        ) {
          continue
        }

        prepared.add(material)
        this.normalizePhysicalMaterial(material)
        this.repairConvertedMaterial(material)
        this.improveTextureFiltering(material)
      }
    })
  }

  setEnvironmentRotation(rotation: Euler): void {
    for (const material of this.environmentMaterials) {
      material.envMapRotation.copy(rotation)
    }
  }

  private normalizePhysicalMaterial(material: SurfaceMaterial): void {
    if (!(material instanceof MeshPhysicalMaterial)) return

    material.ior = 1.5
    material.specularIntensity = 0.55
    material.specularColor.setHex(0xffffff)
  }

  private improveTextureFiltering(material: SurfaceMaterial): void {
    const textures = [
      material.map,
      material.normalMap,
      material.roughnessMap,
      material.metalnessMap,
      material.aoMap,
      material.emissiveMap,
    ]

    for (const texture of textures) {
      if (!texture || texture.anisotropy === this.textureAnisotropy) continue
      texture.anisotropy = this.textureAnisotropy
      texture.needsUpdate = true
    }
  }

  private repairConvertedMaterial(material: SurfaceMaterial): void {
    const name = material.name.toLowerCase()

    if (name.startsWith('101219')) {
      material.color.setHex(0xffffff)
    }

    if (name.includes('44921')) {
      material.roughness = 0.62
      material.emissive.setHex(0xffffff)
      material.emissiveMap = material.map
      material.emissiveIntensity = 0.04
    }

    if (name === '2011.14_highres') {
      material.color.setHex(0xffffff)
      material.roughness = 0.66
    }

    if (name === 'coolgray1') {
      material.color.setHex(0x5b5d60)
    }

    if (name === 'gray8') {
      material.color.setHex(0x4a4b4d)
      material.roughness = 0.65
    }

    if (name === 'gray7') {
      material.color.setHex(0x898d90)
      material.metalness = 0.65
      material.roughness = POLISHED_ROUGHNESS
      this.setEnvironmentStrength(material, 0.18)
    }

    if (name === 'silver') {
      material.color.setHex(0xc8cccf)
      material.metalness = 1
      material.roughness = POLISHED_ROUGHNESS
      this.setEnvironmentStrength(material, 0.27)
    }

    if (name.includes('chrome')) {
      material.color.setHex(0xcfd3d5)
      material.metalness = 1
      material.roughness = POLISHED_ROUGHNESS
      this.setEnvironmentStrength(material, 0.18)
    }

    if (name.includes('dourado')) {
      material.metalness = 1
      material.roughness = POLISHED_ROUGHNESS
      this.setEnvironmentStrength(material, 0.14)
    }

    if (name.includes('metal_corrogated_shiny')) {
      material.metalness = 1
      material.roughness = POLISHED_ROUGHNESS
      this.setEnvironmentStrength(material, 0.12)
    }

    if (name === 'metal_rough') {
      material.metalness = 1
      material.roughness = POLISHED_ROUGHNESS
      this.setEnvironmentStrength(material, 0.12)
    }

    if (name.includes('black-hammertone') || name.includes('mixer02')) {
      material.color.setHex(0x25282a)
      material.metalness = 0.72
      material.roughness = POLISHED_ROUGHNESS
      this.setEnvironmentStrength(material, 0.12)
    }

    if (name.includes('mirror')) {
      this.removeMirrorTextures(material)
      material.color.setHex(0xffffff)
      material.emissive.setHex(0x000000)
      material.emissiveIntensity = 1
      material.metalness = 1
      material.roughness = 0
      material.normalScale.set(1, -1)
      material.aoMapIntensity = 1
      material.opacity = 1
      material.transparent = false
      material.depthTest = true
      material.depthWrite = true
      material.side = DoubleSide
      this.setEnvironmentStrength(material, 0.18)

      if (material instanceof MeshPhysicalMaterial) {
        material.transmission = 0
        material.thickness = 0
        material.clearcoat = 0
        material.iridescence = 0
        material.sheen = 0
        material.specularIntensity = 1
        material.specularColor.setHex(0xffffff)
      }
    }

    if (name.includes('glass_pure')) {
      material.color.setRGB(
        0.549019992351532,
        0.549019992351532,
        0.549019992351532,
      )
      material.metalness = 0
      material.roughness = 0.41904890537261963
      material.transparent = true
      material.opacity = 0.022857213392853737
      material.depthWrite = false
      material.side = DoubleSide
      material.forceSinglePass = false
      this.setEnvironmentStrength(material, 0.08937)

      if (material instanceof MeshPhysicalMaterial) {
        material.ior = 1000
        material.specularIntensity = 1
        material.specularColor.setRGB(
          0.3004954159259796,
          0.3004954159259796,
          0.3004954159259796,
        )
        material.transmission = 0
        material.thickness = 0
        material.clearcoat = 0
      }
    }

    if (name.includes('vidro_difusor')) {
      material.color.setScalar(0.501961)
      material.roughness = 0.1175686
      material.transparent = true
      material.opacity = 0.0509804
      material.depthWrite = false
      material.side = DoubleSide
      material.forceSinglePass = true
      this.setEnvironmentStrength(material, 0.16)

      if (material instanceof MeshPhysicalMaterial) {
        material.transmission = 0
        material.thickness = 0
      }
    }

    const tuning = MATERIAL_TUNING[name]
    if (tuning) this.applyTuning(material, tuning)
  }

  setLocalEnvironment(material: SurfaceMaterial, enabled: boolean): void {
    if (enabled) {
      this.setEnvironmentStrength(material, material.envMapIntensity)
    } else {
      material.envMap = null
      material.needsUpdate = true
      this.environmentMaterials.delete(material)
    }
  }

  private applyTuning(
    material: SurfaceMaterial,
    tuning: MaterialTuning,
  ): void {
    material.color.set(tuning.color)
    material.roughness = tuning.roughness
    material.metalness = tuning.metalness
    material.envMapIntensity = tuning.envMapIntensity
    material.opacity = tuning.opacity
    material.transparent = tuning.transparent
    material.depthWrite = tuning.depthWrite
    material.emissive.set(tuning.emissive)
    material.emissiveIntensity = tuning.emissiveIntensity

    if (tuning.normalScale) material.normalScale.set(...tuning.normalScale)
    if (tuning.aoIntensity !== undefined) {
      material.aoMapIntensity = tuning.aoIntensity
    }

    if (tuning.localEnvironment) {
      this.setEnvironmentStrength(material, tuning.envMapIntensity)
    } else {
      material.envMap = null
      this.environmentMaterials.delete(material)
    }

    if (material instanceof MeshPhysicalMaterial) {
      if (tuning.transmission !== undefined) {
        material.transmission = tuning.transmission
      }
      if (tuning.ior !== undefined) material.ior = tuning.ior
      if (tuning.thickness !== undefined) material.thickness = tuning.thickness
      if (tuning.clearcoat !== undefined) material.clearcoat = tuning.clearcoat
      if (tuning.clearcoatRoughness !== undefined) {
        material.clearcoatRoughness = tuning.clearcoatRoughness
      }
      if (tuning.specularIntensity !== undefined) {
        material.specularIntensity = tuning.specularIntensity
      }
      if (tuning.specularColor) {
        material.specularColor.set(tuning.specularColor)
      }
    }

    material.needsUpdate = true
  }

  private setEnvironmentStrength(
    material: SurfaceMaterial,
    intensity: number,
  ): void {
    material.envMap = this.environment
    material.envMapIntensity = intensity
    material.needsUpdate = true
    this.environmentMaterials.add(material)
  }

  private removeMirrorTextures(material: SurfaceMaterial): void {
    material.map = null
    material.lightMap = null
    material.aoMap = null
    material.emissiveMap = null
    material.bumpMap = null
    material.normalMap = null
    material.displacementMap = null
    material.roughnessMap = null
    material.metalnessMap = null
    material.alphaMap = null

    if (material instanceof MeshPhysicalMaterial) {
      material.anisotropyMap = null
      material.clearcoatMap = null
      material.clearcoatNormalMap = null
      material.clearcoatRoughnessMap = null
      material.iridescenceMap = null
      material.iridescenceThicknessMap = null
      material.sheenColorMap = null
      material.sheenRoughnessMap = null
      material.specularColorMap = null
      material.specularIntensityMap = null
      material.thicknessMap = null
      material.transmissionMap = null
    }
  }
}
