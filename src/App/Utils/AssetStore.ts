import type { DataTexture } from 'three/webgpu'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'

export interface LoadedAssets {
  bathroom: GLTF
  environment: DataTexture
}

export class AssetStore {
  private assets: LoadedAssets | null = null

  set(assets: LoadedAssets): void {
    this.assets = assets
  }

  get(): LoadedAssets {
    if (!this.assets) {
      throw new Error('Assets are not loaded')
    }

    return this.assets
  }
}
