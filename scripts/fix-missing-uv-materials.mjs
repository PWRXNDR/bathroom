import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const DARK_NEUTRAL_LINEAR = [0.026, 0.024, 0.02, 1]

const inputPath = resolve(process.argv[2] ?? 'public/models/bathroom_decimated2_optimized.glb')
const outputPath = resolve(process.argv[3] ?? inputPath)

function readChunks(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error(`${basename(inputPath)} is not a GLB file`)
  }

  if (view.getUint32(4, true) !== 2) {
    throw new Error('Only glTF 2.0 GLB files are supported')
  }

  const declaredLength = view.getUint32(8, true)
  if (declaredLength !== bytes.byteLength) {
    throw new Error(`Invalid GLB length: header=${declaredLength}, file=${bytes.byteLength}`)
  }

  const chunks = []
  let offset = 12

  while (offset < bytes.byteLength) {
    const length = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    const start = offset + 8
    const end = start + length

    if (end > bytes.byteLength) throw new Error('Invalid GLB chunk length')
    chunks.push({ type, data: bytes.subarray(start, end) })
    offset = end
  }

  return chunks
}

function encodeJson(json) {
  const raw = new TextEncoder().encode(JSON.stringify(json))
  const paddedLength = (raw.byteLength + 3) & ~3
  const padded = new Uint8Array(paddedLength)
  padded.fill(0x20)
  padded.set(raw)
  return padded
}

function writeGlb(chunks) {
  const length = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.byteLength, 0)
  const bytes = new Uint8Array(length)
  const view = new DataView(bytes.buffer)

  view.setUint32(0, GLB_MAGIC, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, length, true)

  let offset = 12
  for (const chunk of chunks) {
    view.setUint32(offset, chunk.data.byteLength, true)
    view.setUint32(offset + 4, chunk.type, true)
    bytes.set(chunk.data, offset + 8)
    offset += 8 + chunk.data.byteLength
  }

  return bytes
}

function repairMaterials(json) {
  const repairs = []
  const materials = json.materials ?? []

  for (let meshIndex = 0; meshIndex < (json.meshes ?? []).length; meshIndex += 1) {
    const mesh = json.meshes[meshIndex]

    for (let primitiveIndex = 0; primitiveIndex < (mesh.primitives ?? []).length; primitiveIndex += 1) {
      const primitive = mesh.primitives[primitiveIndex]
      const material = materials[primitive.material]
      const baseColorTexture = material?.pbrMetallicRoughness?.baseColorTexture
      if (!baseColorTexture) continue

      const texCoord = baseColorTexture.texCoord ?? 0
      if (primitive.attributes?.[`TEXCOORD_${texCoord}`] !== undefined) continue

      const replacement = structuredClone(material)
      replacement.name = `${material.name ?? `Material_${primitive.material}`}__no_uv`
      replacement.pbrMetallicRoughness ??= {}
      delete replacement.pbrMetallicRoughness.baseColorTexture
      replacement.pbrMetallicRoughness.baseColorFactor = DARK_NEUTRAL_LINEAR

      const replacementIndex = materials.push(replacement) - 1
      primitive.material = replacementIndex
      repairs.push({
        mesh: mesh.name ?? `mesh_${meshIndex}`,
        primitive: primitiveIndex,
        material: material.name ?? `material_${primitive.material}`,
        texCoord,
        replacement: replacement.name,
      })
    }
  }

  return repairs
}

const inputBytes = new Uint8Array(await readFile(inputPath))
const chunks = readChunks(inputBytes)
const jsonChunk = chunks.find((chunk) => chunk.type === JSON_CHUNK)
if (!jsonChunk) throw new Error('GLB JSON chunk is missing')

const jsonText = new TextDecoder().decode(jsonChunk.data).replace(/[\u0000\u0020]+$/u, '')
const json = JSON.parse(jsonText)
const repairs = repairMaterials(json)

if (repairs.length === 0) {
  console.log('No base-color textures reference missing UV sets.')
  if (outputPath !== inputPath) await writeFile(outputPath, inputBytes)
  process.exit(0)
}

jsonChunk.data = encodeJson(json)
const outputBytes = writeGlb(chunks)
const temporaryPath = resolve(dirname(outputPath), `.${basename(outputPath)}.${process.pid}.tmp`)

try {
  await writeFile(temporaryPath, outputBytes)
  if (outputPath === inputPath) await unlink(outputPath)
  await rename(temporaryPath, outputPath)
} catch (error) {
  await unlink(temporaryPath).catch(() => {})
  throw error
}

for (const repair of repairs) {
  console.log(
    `Repaired ${repair.mesh} primitive ${repair.primitive}: ${repair.material} used TEXCOORD_${repair.texCoord}; assigned ${repair.replacement}.`,
  )
}
console.log(`Wrote ${outputPath} (${outputBytes.byteLength} bytes).`)
