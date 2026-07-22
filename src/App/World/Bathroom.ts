import {
  DoubleSide,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Scene,
} from 'three/webgpu'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'

type SurfaceMaterial = MeshStandardMaterial | MeshPhysicalMaterial

export class Bathroom {
  readonly model: Object3D

  constructor(scene: Scene, gltf: GLTF) {
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

      for (const material of materials) {
        if (
          !(material instanceof MeshStandardMaterial) ||
          prepared.has(material)
        ) {
          continue
        }

        prepared.add(material)
        material.envMapIntensity = 0.68
        this.normalizePhysicalMaterial(material)
        this.repairConvertedMaterial(material)

        const name = material.name.toLowerCase()
        if (name.includes('glass_pure') || name.includes('vidro_difusor')) {
          child.castShadow = false
        }
      }
    })
  }

  private normalizePhysicalMaterial(material: SurfaceMaterial): void {
    if (!(material instanceof MeshPhysicalMaterial)) return

    material.ior = 1.5
    material.specularIntensity = 0.65
    material.specularColor.setHex(0xffffff)
  }

  private repairConvertedMaterial(material: SurfaceMaterial): void {
    const name = material.name.toLowerCase()

    if (name.startsWith('101219')) {
      material.color.setHex(0xffffff)
      material.roughness = Math.max(0.44, Math.min(material.roughness, 0.52))
      material.envMapIntensity = 0.82

      if (material instanceof MeshPhysicalMaterial) {
        material.specularIntensity = 0.82
      }
    }

    if (name === '2011.14_highres') {
      material.color.setHex(0xffffff)
      material.roughness = 0.64
      material.envMapIntensity = 0.48
    }

    if (name === 'gray7') {
      material.roughness = 0.4
      material.envMapIntensity = 0.58
    }

    if (name === 'gray8') {
      material.roughness = 0.68
      material.envMapIntensity = 0.42
    }

    if (name.includes('mountain-oak')) {
      material.roughness = 0.74
      material.envMapIntensity = 0.4
    }

    if (name === 'coolgray1') {
      material.color.setHex(0x17191b)
      material.roughness = 0.84
      material.emissive.setHex(0x000000)
      material.emissiveIntensity = 0
    }

    if (name === 'material') {
      material.color.setHex(0xffe2c2)
      material.emissive.setHex(0xffe2c2)
      material.emissiveIntensity = 3.2
    }

    if (name.includes('mirror')) {
      material.color.setHex(0x858585)
      material.metalness = 1
      material.roughness = 0.085
      material.envMapIntensity = 0.22
    }

    if (name.includes('chrome')) {
      material.color.setHex(0x45484a)
      material.metalness = 1
      material.roughness = 0.32
      material.envMapIntensity = 0.82
    }

    if (name === 'silver') {
      material.color.setHex(0x85898c)
      material.metalness = 1
      material.roughness = 0.28
      material.envMapIntensity = 0.76
    }

    if (name.includes('dourado')) {
      material.metalness = 1
      material.roughness = 0.33
      material.envMapIntensity = 0.72
    }

    if (name.includes('metal_corrogated_shiny')) {
      material.metalness = 1
      material.roughness = 0.22
    }

    if (name === 'metal_rough') {
      material.metalness = 1
      material.roughness = 0.46
    }

    if (name.includes('black-hammertone') || name.includes('mixer02')) {
      material.color.setHex(0x1c1e20)
      material.metalness = 0.8
      material.roughness = 0.36
    }

    if (name === 'cream_ceramic') {
      material.roughness = 0.36
      material.envMapIntensity = 0.58
    }

    if (name.includes('glass_pure')) {
      material.color.setHex(0xe2e0dc)
      material.metalness = 0
      material.roughness = 0.16
      material.transparent = true
      material.opacity = 0.065
      material.depthWrite = false
      material.side = DoubleSide
      material.forceSinglePass = true
      material.envMapIntensity = 0.32

      if (material instanceof MeshPhysicalMaterial) {
        material.transmission = 0
        material.thickness = 0
        material.ior = 1.45
        material.specularIntensity = 0.45
      }
    }

    if (name.includes('vidro_difusor')) {
      material.color.setHex(0xf4e4d2)
      material.roughness = 0.2
      material.transparent = true
      material.opacity = 0.12
      material.depthWrite = false
      material.side = DoubleSide
      material.forceSinglePass = true
      material.envMapIntensity = 0.36

      if (material instanceof MeshPhysicalMaterial) {
        material.transmission = 0
        material.thickness = 0
        material.ior = 1.45
        material.specularIntensity = 0.5
      }
    }
  }
}
