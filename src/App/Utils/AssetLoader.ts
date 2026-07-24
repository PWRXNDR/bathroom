import type { DataTexture, WebGPURenderer } from 'three/webgpu'
import { LoadingManager } from 'three/webgpu'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { ASSET_PATHS } from './Store'

interface LoadedAssets {
  bathroom: GLTF
  towel: GLTF
  environment: DataTexture
}

type ProgressHandler = (progress: number) => void

interface ResourceProgress {
  loaded: number
  total: number
}

export class AssetLoader {
  private readonly progress = new Map<string, ResourceProgress>()
  private readonly manager = new LoadingManager()
  private readonly dracoLoader = new DRACOLoader(this.manager)
  private readonly ktx2Loader = new KTX2Loader(this.manager)
  private readonly gltfLoader = new GLTFLoader(this.manager)
  private readonly hdrLoader = new HDRLoader(this.manager)

  constructor(
    renderer: WebGPURenderer,
    private readonly onProgress: ProgressHandler,
  ) {
    this.dracoLoader.setDecoderPath(ASSET_PATHS.draco).setWorkerLimit(3)
    this.ktx2Loader
      .setTranscoderPath(ASSET_PATHS.basis)
      .setWorkerLimit(3)
      .detectSupport(renderer)

    this.gltfLoader.setDRACOLoader(this.dracoLoader)
    this.gltfLoader.setKTX2Loader(this.ktx2Loader)
  }

  async load(): Promise<LoadedAssets> {
    const [bathroom, towel, environment] = await Promise.all([
      this.loadGLTF(ASSET_PATHS.model),
      this.loadGLTF(ASSET_PATHS.towel),
      this.loadHDR(ASSET_PATHS.environment),
    ])

    this.onProgress(0.9)
    this.dracoLoader.dispose()
    this.ktx2Loader.dispose()

    return { bathroom, towel, environment }
  }

  private loadGLTF(url: string): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        resolve,
        (event) => this.updateProgress(url, event),
        reject,
      )
    })
  }

  private loadHDR(url: string): Promise<DataTexture> {
    return new Promise((resolve, reject) => {
      this.hdrLoader.load(
        url,
        (texture) => resolve(texture as DataTexture),
        (event) => this.updateProgress(url, event),
        reject,
      )
    })
  }

  private updateProgress(url: string, event: ProgressEvent<EventTarget>): void {
    const current = this.progress.get(url)
    const total = event.lengthComputable
      ? event.total
      : Math.max(current?.total ?? 0, event.loaded)

    this.progress.set(url, { loaded: event.loaded, total })

    let loadedBytes = 0
    let totalBytes = 0

    for (const resource of this.progress.values()) {
      loadedBytes += resource.loaded
      totalBytes += Math.max(resource.total, resource.loaded)
    }

    if (totalBytes > 0) {
      this.onProgress(Math.min((loadedBytes / totalBytes) * 0.88, 0.88))
    }
  }
}
