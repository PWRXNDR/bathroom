import {
  DoubleSide,
  Euler,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Scene,
  type Texture,
} from 'three/webgpu'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'

type SurfaceMaterial = MeshStandardMaterial | MeshPhysicalMaterial

const POLISHED_ROUGHNESS = 0.02
const MIRROR_ROUGHNESS = 0.005

export class Bathroom {
  readonly model: Object3D
  private readonly environmentMaterials = new Set<SurfaceMaterial>()

  constructor(
    scene: Scene,
    gltf: GLTF,
    private readonly environment: Texture,
    private readonly textureAnisotropy: number,
  ) {
    this.model = gltf.scene
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
      material.color.setHex(0xe7e9ea)
      material.metalness = 1
      material.roughness = MIRROR_ROUGHNESS
      this.setEnvironmentStrength(material, 0.022)
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
}
