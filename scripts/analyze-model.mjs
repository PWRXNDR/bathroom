import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

const DEFAULT_MODELS = [
  'bathroom_interior.glb',
  'bathroom_interior_compressed.glb',
  'bathroom_decimated.glb',
  'bathroom_decimated_compressed.glb',
  'bathroom_optimized.glb',
]

const COMPONENT_BYTES = new Map([
  [5120, 1],
  [5121, 1],
  [5122, 2],
  [5123, 2],
  [5125, 4],
  [5126, 4],
])

const TYPE_SHAPES = new Map([
  ['SCALAR', [1, 1]],
  ['VEC2', [1, 2]],
  ['VEC3', [1, 3]],
  ['VEC4', [1, 4]],
  ['MAT2', [2, 2]],
  ['MAT3', [3, 3]],
  ['MAT4', [4, 4]],
])

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..')
const numberFormat = new Intl.NumberFormat('en-US')

process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') process.exit(0)
  throw error
})

function formatInteger(value) {
  return numberFormat.format(value)
}

function formatBytes(value) {
  const mib = value / 1024 / 1024
  return `${formatInteger(value)} B (${mib.toFixed(2)} MiB)`
}

function formatPercent(numerator, denominator) {
  if (denominator === 0) return '0.0%'
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}

function plural(value, singular, pluralForm = `${singular}s`) {
  return `${formatInteger(value)} ${value === 1 ? singular : pluralForm}`
}

function formatEntryList(entries, mapEntry, limit = 24) {
  const visible = entries.slice(0, limit).map(mapEntry).join(', ')
  const remaining = entries.length - limit
  return remaining > 0 ? `${visible}, ... +${formatInteger(remaining)} more` : visible
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function shortHash(value) {
  return value.slice(0, 16)
}

function dataUriBytes(uri) {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(uri)
  if (!match) return undefined
  const [, mimeType, base64, payload] = match
  return {
    bytes: base64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload)),
    mimeType: mimeType || 'application/octet-stream',
  }
}

function inferMimeType(uri = '') {
  const extension = extname(uri.split(/[?#]/, 1)[0]).toLowerCase()
  const mimeTypes = new Map([
    ['.avif', 'image/avif'],
    ['.jpeg', 'image/jpeg'],
    ['.jpg', 'image/jpeg'],
    ['.ktx2', 'image/ktx2'],
    ['.png', 'image/png'],
    ['.webp', 'image/webp'],
  ])
  return mimeTypes.get(extension) ?? 'application/octet-stream'
}

function parseGlb(fileBytes, filePath) {
  if (fileBytes.length < 20 || fileBytes.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error(`${filePath} is not a valid binary glTF file`)
  }

  const version = fileBytes.readUInt32LE(4)
  const declaredLength = fileBytes.readUInt32LE(8)
  if (version !== 2) throw new Error(`Unsupported GLB version ${version}`)
  if (declaredLength > fileBytes.length) {
    throw new Error(`Truncated GLB: header declares ${declaredLength} bytes, file has ${fileBytes.length}`)
  }

  let json
  const binaryChunks = []
  let offset = 12
  while (offset + 8 <= declaredLength) {
    const chunkLength = fileBytes.readUInt32LE(offset)
    const chunkType = fileBytes.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkLength
    if (chunkEnd > declaredLength) throw new Error('A GLB chunk exceeds the declared file length')

    const chunk = fileBytes.subarray(chunkStart, chunkEnd)
    if (chunkType === JSON_CHUNK) {
      const source = chunk.toString('utf8').replace(/[\u0000\u0020]+$/u, '')
      json = JSON.parse(source)
    } else if (chunkType === BIN_CHUNK) {
      binaryChunks.push(chunk)
    }
    offset = chunkEnd
  }

  if (!json) throw new Error('GLB has no JSON chunk')
  return { json, binaryChunks }
}

async function resolveBuffers(json, binaryChunks, filePath) {
  const buffers = []
  let binaryIndex = 0

  for (let index = 0; index < (json.buffers?.length ?? 0); index += 1) {
    const definition = json.buffers[index]
    if (!definition.uri) {
      buffers.push(binaryChunks[binaryIndex])
      binaryIndex += 1
      continue
    }

    const embedded = dataUriBytes(definition.uri)
    if (embedded) {
      buffers.push(embedded.bytes)
      continue
    }

    const externalPath = resolve(dirname(filePath), decodeURIComponent(definition.uri))
    buffers.push(await readFile(externalPath))
  }

  return buffers
}

function bufferViewBytes(json, buffers, bufferViewIndex) {
  const view = json.bufferViews?.[bufferViewIndex]
  if (!view) return undefined
  const buffer = buffers[view.buffer]
  if (!buffer) return undefined
  const start = view.byteOffset ?? 0
  return buffer.subarray(start, start + view.byteLength)
}

function align4(value) {
  return Math.ceil(value / 4) * 4
}

function accessorElementSize(accessor) {
  const componentBytes = COMPONENT_BYTES.get(accessor.componentType)
  const shape = TYPE_SHAPES.get(accessor.type)
  if (!componentBytes || !shape) return undefined

  const [columns, rows] = shape
  if (columns === 1) return rows * componentBytes
  const columnBytes = rows * componentBytes
  return columns * (componentBytes < 4 ? align4(columnBytes) : columnBytes)
}

function accessorLogicalBytes(json, buffers, accessor) {
  if (accessor.bufferView === undefined || accessor.sparse) return undefined
  const view = json.bufferViews?.[accessor.bufferView]
  const viewBytes = bufferViewBytes(json, buffers, accessor.bufferView)
  const elementSize = accessorElementSize(accessor)
  if (!view || !viewBytes || !elementSize) return undefined

  const count = accessor.count ?? 0
  const stride = view.byteStride ?? elementSize
  const start = accessor.byteOffset ?? 0
  if (count === 0) return Buffer.alloc(0)
  if (start + (count - 1) * stride + elementSize > viewBytes.length) return undefined
  if (stride === elementSize) return viewBytes.subarray(start, start + count * elementSize)

  const packed = Buffer.allocUnsafe(count * elementSize)
  for (let index = 0; index < count; index += 1) {
    viewBytes.copy(packed, index * elementSize, start + index * stride, start + index * stride + elementSize)
  }
  return packed
}

function collectExtensions(root) {
  const extensions = new Set()
  const stack = [root]
  while (stack.length > 0) {
    const value = stack.pop()
    if (!value || typeof value !== 'object') continue
    if (value.extensions && typeof value.extensions === 'object') {
      for (const name of Object.keys(value.extensions)) extensions.add(name)
    }
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') stack.push(child)
    }
  }
  return [...extensions].sort()
}

function primitiveElementCount(json, primitive) {
  if (primitive.indices !== undefined) return json.accessors?.[primitive.indices]?.count ?? 0
  const positionAccessor = primitive.attributes?.POSITION
  return positionAccessor === undefined ? 0 : json.accessors?.[positionAccessor]?.count ?? 0
}

function primitiveTriangleCount(json, primitive) {
  const count = primitiveElementCount(json, primitive)
  const mode = primitive.mode ?? 4
  if (mode === 4) return Math.floor(count / 3)
  if (mode === 5 || mode === 6) return Math.max(0, count - 2)
  return 0
}

function primitivePositionCount(json, primitive) {
  const accessorIndex = primitive.attributes?.POSITION
  return accessorIndex === undefined ? 0 : json.accessors?.[accessorIndex]?.count ?? 0
}

function sceneUsage(json, sceneIndex) {
  const meshInstances = new Map()
  const visited = new Set()
  const roots = json.scenes?.[sceneIndex]?.nodes ?? json.nodes?.map((_, index) => index) ?? []
  const stack = [...roots]

  while (stack.length > 0) {
    const nodeIndex = stack.pop()
    if (visited.has(nodeIndex)) continue
    visited.add(nodeIndex)
    const node = json.nodes?.[nodeIndex]
    if (!node) continue
    if (node.mesh !== undefined) {
      meshInstances.set(node.mesh, (meshInstances.get(node.mesh) ?? 0) + 1)
    }
    if (node.children) stack.push(...node.children)
  }

  return { meshInstances, nodeCount: visited.size }
}

function groupByHash(entries) {
  const groups = new Map()
  for (const entry of entries) {
    const group = groups.get(entry.hash) ?? []
    group.push(entry)
    groups.set(entry.hash, group)
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
}

function printableName(name, fallback) {
  const normalized = String(name ?? '').replace(/[\r\n\t]+/g, ' ').trim()
  return normalized || fallback
}

function analyzeImages(json, buffers) {
  const images = []
  for (let index = 0; index < (json.images?.length ?? 0); index += 1) {
    const image = json.images[index]
    let bytes
    let embedded = false
    let mimeType = image.mimeType
    let source = 'external'

    if (image.bufferView !== undefined) {
      bytes = bufferViewBytes(json, buffers, image.bufferView)
      embedded = true
      source = `bufferView ${image.bufferView}`
    } else if (image.uri) {
      const data = dataUriBytes(image.uri)
      if (data) {
        bytes = data.bytes
        mimeType ||= data.mimeType
        embedded = true
        source = 'data URI'
      } else {
        mimeType ||= inferMimeType(image.uri)
        source = image.uri
      }
    }

    images.push({
      index,
      name: printableName(image.name, `image_${index}`),
      mimeType: mimeType ?? 'application/octet-stream',
      embedded,
      source,
      byteLength: bytes?.length ?? 0,
      hash: bytes ? hash(bytes) : undefined,
    })
  }
  return images
}

function analyzeDuplicateBufferViews(json, buffers) {
  const entries = []
  for (let index = 0; index < (json.bufferViews?.length ?? 0); index += 1) {
    const bytes = bufferViewBytes(json, buffers, index)
    if (!bytes) continue
    entries.push({ index, byteLength: bytes.length, hash: hash(bytes) })
  }
  return groupByHash(entries)
}

function analyzeDuplicateAccessors(json, buffers) {
  const entries = []
  let unresolved = 0
  for (let index = 0; index < (json.accessors?.length ?? 0); index += 1) {
    const accessor = json.accessors[index]
    const bytes = accessorLogicalBytes(json, buffers, accessor)
    if (!bytes) {
      unresolved += 1
      continue
    }
    const descriptor = `${accessor.componentType}|${accessor.type}|${accessor.count}|${Boolean(accessor.normalized)}|`
    const fingerprint = createHash('sha256').update(descriptor).update(bytes).digest('hex')
    entries.push({
      index,
      byteLength: bytes.length,
      hash: fingerprint,
      type: `${accessor.type}/${accessor.componentType}`,
      count: accessor.count ?? 0,
    })
  }
  return { groups: groupByHash(entries), unresolved }
}

function buildMetrics(json, buffers) {
  const selectedSceneIndex = json.scene ?? (json.scenes?.length ? 0 : undefined)
  const usage = sceneUsage(json, selectedSceneIndex)
  const meshes = []
  const uniquePositionAccessors = new Set()

  let primitiveDefinitions = 0
  let definitionTriangles = 0
  let definitionPositionSlots = 0
  let definitionIndexEntries = 0
  let definitionUnindexedElements = 0
  let renderDraws = 0
  let renderTriangles = 0
  let renderPositionSlots = 0
  let renderIndexEntries = 0
  let renderUnindexedElements = 0

  for (let meshIndex = 0; meshIndex < (json.meshes?.length ?? 0); meshIndex += 1) {
    const mesh = json.meshes[meshIndex]
    const instances = usage.meshInstances.get(meshIndex) ?? 0
    let triangles = 0
    let positions = 0
    let indices = 0
    let unindexed = 0
    const materials = new Set()

    for (const primitive of mesh.primitives ?? []) {
      primitiveDefinitions += 1
      const primitiveTriangles = primitiveTriangleCount(json, primitive)
      const positionCount = primitivePositionCount(json, primitive)
      triangles += primitiveTriangles
      positions += positionCount
      if (primitive.attributes?.POSITION !== undefined) {
        uniquePositionAccessors.add(primitive.attributes.POSITION)
      }
      if (primitive.material !== undefined) {
        materials.add(printableName(json.materials?.[primitive.material]?.name, `material_${primitive.material}`))
      } else {
        materials.add('default material')
      }
      if (primitive.indices !== undefined) indices += primitiveElementCount(json, primitive)
      else unindexed += primitiveElementCount(json, primitive)
    }

    definitionTriangles += triangles
    definitionPositionSlots += positions
    definitionIndexEntries += indices
    definitionUnindexedElements += unindexed
    renderDraws += (mesh.primitives?.length ?? 0) * instances
    renderTriangles += triangles * instances
    renderPositionSlots += positions * instances
    renderIndexEntries += indices * instances
    renderUnindexedElements += unindexed * instances

    meshes.push({
      index: meshIndex,
      name: printableName(mesh.name, `mesh_${meshIndex}`),
      primitives: mesh.primitives?.length ?? 0,
      instances,
      triangles,
      renderedTriangles: triangles * instances,
      positions,
      indices,
      materials: [...materials],
    })
  }

  let uniquePositionSlots = 0
  for (const accessorIndex of uniquePositionAccessors) {
    uniquePositionSlots += json.accessors?.[accessorIndex]?.count ?? 0
  }

  return {
    selectedSceneIndex,
    usage,
    meshes,
    primitiveDefinitions,
    definitionTriangles,
    definitionPositionSlots,
    uniquePositionSlots,
    uniquePositionAccessorCount: uniquePositionAccessors.size,
    definitionIndexEntries,
    definitionUnindexedElements,
    renderDraws,
    renderTriangles,
    renderPositionSlots,
    renderIndexEntries,
    renderUnindexedElements,
  }
}

function summarizeMimeTypes(images) {
  const summary = new Map()
  for (const image of images.filter((entry) => entry.embedded)) {
    const current = summary.get(image.mimeType) ?? { count: 0, bytes: 0 }
    current.count += 1
    current.bytes += image.byteLength
    summary.set(image.mimeType, current)
  }
  if (summary.size === 0) return 'none'
  return [...summary.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([mimeType, value]) => `${mimeType}: ${value.count} / ${formatBytes(value.bytes)}`)
    .join('; ')
}

function printDuplicateGroups(label, groups, describe, limit = 10) {
  const duplicateItems = groups.reduce((total, [, group]) => total + group.length - 1, 0)
  console.log(`  ${label}: ${plural(groups.length, 'identical group')}, ${plural(duplicateItems, 'extra duplicate')}`)
  for (const [fingerprint, group] of groups.slice(0, limit)) {
    console.log(`    ${shortHash(fingerprint)}  ${describe(group)}`)
  }
  if (groups.length > limit) console.log(`    ... ${formatInteger(groups.length - limit)} more groups`)
}

function printReport(filePath, fileBytes, json, metrics, images, duplicateImages, duplicateBufferViews, duplicateAccessors) {
  const embeddedImages = images.filter((image) => image.embedded)
  const embeddedImageBytes = embeddedImages.reduce((total, image) => total + image.byteLength, 0)
  const meshInstanceCount = [...metrics.usage.meshInstances.values()].reduce((total, count) => total + count, 0)
  const usedExtensions = collectExtensions(json)
  const rootUsedExtensions = json.extensionsUsed ?? []
  const requiredExtensions = json.extensionsRequired ?? []
  const allTextureCount = json.textures?.length ?? 0
  const ktxTextureCount = images.filter((image) => image.mimeType === 'image/ktx2').length

  console.log('\n' + '='.repeat(100))
  console.log(relative(projectRoot, filePath).replaceAll('\\', '/'))
  console.log('='.repeat(100))
  console.log(`File: ${formatBytes(fileBytes.length)}`)
  console.log(`Asset generator: ${json.asset?.generator ?? 'not declared'}; glTF ${json.asset?.version ?? 'unknown'}`)
  console.log(
    `Structure: ${plural(json.scenes?.length ?? 0, 'scene')}, ${plural(json.nodes?.length ?? 0, 'node')}, ` +
      `${plural(json.meshes?.length ?? 0, 'mesh', 'meshes')}, ${plural(metrics.primitiveDefinitions, 'primitive definition')}`,
  )
  console.log(
    `Selected scene: ${metrics.selectedSceneIndex ?? 'none'}; ${plural(metrics.usage.nodeCount, 'reachable node')}, ` +
      `${plural(meshInstanceCount, 'mesh instance')}, ${plural(metrics.renderDraws, 'render draw')}`,
  )
  console.log(
    `Triangles: ${formatInteger(metrics.definitionTriangles)} in mesh definitions; ` +
      `${formatInteger(metrics.renderTriangles)} rendered in the selected scene`,
  )
  console.log(
    `POSITION slots: ${formatInteger(metrics.definitionPositionSlots)} across primitives; ` +
      `${formatInteger(metrics.uniquePositionSlots)} across ${formatInteger(metrics.uniquePositionAccessorCount)} unique POSITION accessors; ` +
      `${formatInteger(metrics.renderPositionSlots)} after mesh instancing`,
  )
  console.log(
    `Render index count: ${formatInteger(metrics.renderIndexEntries)} indexed entries` +
      (metrics.renderUnindexedElements > 0
        ? ` + ${formatInteger(metrics.renderUnindexedElements)} unindexed vertices = ${formatInteger(metrics.renderIndexEntries + metrics.renderUnindexedElements)} submitted elements`
        : ''),
  )
  console.log(
    `Definition index count: ${formatInteger(metrics.definitionIndexEntries)} indexed entries` +
      (metrics.definitionUnindexedElements > 0
        ? ` + ${formatInteger(metrics.definitionUnindexedElements)} unindexed vertices`
        : ''),
  )
  console.log(
    `Resources: ${plural(json.materials?.length ?? 0, 'material')}, ${plural(allTextureCount, 'texture')}, ` +
      `${plural(json.images?.length ?? 0, 'image')}, ${plural(json.samplers?.length ?? 0, 'sampler')}`,
  )
  console.log(`KTX2 images: ${ktxTextureCount}/${json.images?.length ?? 0}`)
  console.log(
    `Embedded images: ${embeddedImages.length}/${images.length}, ${formatBytes(embeddedImageBytes)}, ` +
      `${formatPercent(embeddedImageBytes, fileBytes.length)} of GLB; ${summarizeMimeTypes(images)}`,
  )
  console.log(`Extensions used (root): ${rootUsedExtensions.length ? rootUsedExtensions.join(', ') : 'none'}`)
  console.log(`Extensions required: ${requiredExtensions.length ? requiredExtensions.join(', ') : 'none'}`)
  console.log(`Extensions found anywhere: ${usedExtensions.length ? usedExtensions.join(', ') : 'none'}`)

  console.log('\nTop meshes by definition triangles:')
  const topMeshes = [...metrics.meshes]
    .sort((left, right) => right.triangles - left.triangles || right.positions - left.positions || left.index - right.index)
    .slice(0, 15)
  for (const mesh of topMeshes) {
    console.log(
      `  [${mesh.index}] ${mesh.name} | ${formatInteger(mesh.triangles)} tri | ` +
        `${formatInteger(mesh.positions)} POSITION | ${mesh.primitives} prim | ${mesh.instances} instance(s) | ` +
        `${formatInteger(mesh.renderedTriangles)} rendered tri | material: ${formatEntryList(mesh.materials, (entry) => entry, 4)}`,
    )
  }

  console.log('\nExact payload duplication:')
  printDuplicateGroups(
    'Embedded images',
    duplicateImages,
    (group) =>
      `${formatBytes(group[0].byteLength)} each | ${formatEntryList(group, (entry) => `[${entry.index}] ${entry.name}`)}`,
  )
  printDuplicateGroups(
    'BufferViews',
    duplicateBufferViews,
    (group) => `${formatBytes(group[0].byteLength)} each | indices ${formatEntryList(group, (entry) => entry.index)}`,
  )
  printDuplicateGroups(
    'Accessors',
    duplicateAccessors.groups,
    (group) =>
      `${group[0].type}, count ${formatInteger(group[0].count)}, ${formatBytes(group[0].byteLength)} logical each | indices ${formatEntryList(group, (entry) => entry.index)}`,
  )
  if (duplicateAccessors.unresolved > 0) {
    console.log(
      `  Accessor payloads not directly comparable: ${formatInteger(duplicateAccessors.unresolved)} ` +
        '(compressed, sparse, or missing bufferView)',
    )
  }

  console.log('\nHow to read the vertex numbers:')
  console.log('  - POSITION accessor count is the glTF vertex-slot count; triangle corners come from the index accessor.')
  console.log('  - Indexed geometry reuses POSITION slots, so index count is normally much larger than vertex-slot count.')
  console.log('  - UV seams, hard normals, tangents, skinning data, and material boundaries split otherwise coincident vertices.')
  console.log('  - A mesh referenced by multiple nodes is stored once but its draws, triangles, and submitted elements repeat at render time.')
  console.log('  - Summing all accessor counts also counts normals, UVs, colors, tangents, joints, weights, and indices; it is not a vertex total.')
  console.log('  - Draco/meshopt/KTX compression reduces transfer size, not the logical accessor counts; only decimation changes triangle topology.')
  console.log('  - Blender object/edit/evaluated statistics can differ because of welding, modifiers, selected objects, and active-scene visibility.')
}

async function analyzeFile(filePath) {
  const fileBytes = await readFile(filePath)
  const { json, binaryChunks } = parseGlb(fileBytes, filePath)
  const buffers = await resolveBuffers(json, binaryChunks, filePath)
  const metrics = buildMetrics(json, buffers)
  const images = analyzeImages(json, buffers)
  const duplicateImages = groupByHash(images.filter((image) => image.embedded && image.hash))
  const duplicateBufferViews = analyzeDuplicateBufferViews(json, buffers)
  const duplicateAccessors = analyzeDuplicateAccessors(json, buffers)
  printReport(
    filePath,
    fileBytes,
    json,
    metrics,
    images,
    duplicateImages,
    duplicateBufferViews,
    duplicateAccessors,
  )
}

function printHelp() {
  console.log(`Usage: node scripts/analyze-model.mjs [model.glb ...]\n\n`)
  console.log('With no paths, analyzes the five bathroom GLBs in public/models.')
  console.log('The report is metadata-only: Draco/meshopt data is not decompressed.')
}

async function main() {
  const arguments_ = process.argv.slice(2)
  if (arguments_.includes('--help') || arguments_.includes('-h')) {
    printHelp()
    return
  }

  const paths = arguments_.length
    ? arguments_.map((filePath) => resolve(process.cwd(), filePath))
    : DEFAULT_MODELS.map((fileName) => resolve(projectRoot, 'public', 'models', fileName))

  let failures = 0
  for (const filePath of paths) {
    try {
      await analyzeFile(filePath)
    } catch (error) {
      failures += 1
      console.error(`\n${filePath}\n  ERROR: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (failures > 0) process.exitCode = 1
}

await main()
