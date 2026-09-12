// Model/runtime modules are needed only for an explicit image-processing action.
let libraryPromise

async function loadLibrary() {
  if (!libraryPromise) {
    libraryPromise = (async () => {
      const { env } = await import('onnxruntime-web')
      const isolated = typeof self !== 'undefined' && !!self.crossOriginIsolated
      env.wasm.simd = isolated
      env.wasm.numThreads = isolated
        ? Math.max(2, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4)
        : 1
      return import('modern-rembg')
    })().catch(error => {
      // A failed download must not permanently disable processing in this tab.
      libraryPromise = undefined
      throw error
    })
  }
  return libraryPromise
}

export async function removeBackground(file, options) {
  const library = await loadLibrary()
  return library.removeBackground(file, options)
}
