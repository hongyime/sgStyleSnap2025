// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  env: { wasm: {} },
  onnxLoaded: vi.fn(),
  removalLoaded: vi.fn(),
  removeBackground: vi.fn(),
  initializationError: null,
}))
vi.mock('onnxruntime-web', () => {
  return { get env() {
    mocks.onnxLoaded()
    if (mocks.initializationError) {
      const error = mocks.initializationError
      mocks.initializationError = null
      throw error
    }
    return mocks.env
  } }
})
vi.mock('modern-rembg', () => {
  mocks.removalLoaded()
  return { removeBackground: mocks.removeBackground }
})

describe('on-demand background removal', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    mocks.env.wasm = {}
    mocks.initializationError = null
  })

  it('does not import a runtime or model library until processing is requested', async () => {
    await import('../../../src/utils/background-removal')
    expect(mocks.onnxLoaded).not.toHaveBeenCalled()
    expect(mocks.removalLoaded).not.toHaveBeenCalled()
  })

  it('uses the non-isolated fallback and forwards the exact input and options', async () => {
    vi.stubGlobal('self', { crossOriginIsolated: false })
    const input = new Blob(['synthetic input'], { type: 'image/png' })
    const output = new Blob(['synthetic output'], { type: 'image/png' })
    const options = { output: 'mask' }
    mocks.removeBackground.mockResolvedValue(output)
    const { removeBackground } = await import('../../../src/utils/background-removal')
    expect(await removeBackground(input, options)).toBe(output)
    expect(mocks.removeBackground).toHaveBeenCalledWith(input, options)
    expect(mocks.env.wasm).toEqual({ simd: false, numThreads: 1 })
  })

  it('retains the existing isolated-runtime configuration', async () => {
    vi.stubGlobal('self', { crossOriginIsolated: true })
    vi.stubGlobal('navigator', { hardwareConcurrency: 4 })
    const { removeBackground } = await import('../../../src/utils/background-removal')
    await removeBackground(new Blob(['synthetic']))
    expect(mocks.env.wasm).toEqual({ simd: true, numThreads: 4 })
  })

  it('coalesces library initialization while keeping distinct processing calls', async () => {
    const { removeBackground } = await import('../../../src/utils/background-removal')
    const files = [new Blob(['one']), new Blob(['two'])]
    await Promise.all(files.map(file => removeBackground(file)))
    expect(mocks.onnxLoaded).toHaveBeenCalledTimes(1)
    expect(mocks.removeBackground).toHaveBeenCalledTimes(2)
    expect(mocks.removeBackground.mock.calls.map(call => call[0])).toEqual(files)
  })

  it('propagates processing errors so callers can retain the original image', async () => {
    const failure = new Error('synthetic model failure')
    mocks.removeBackground.mockRejectedValueOnce(failure).mockResolvedValueOnce('recovered')
    const { removeBackground } = await import('../../../src/utils/background-removal')
    await expect(removeBackground(new Blob(['first']))).rejects.toBe(failure)
    await expect(removeBackground(new Blob(['second']))).resolves.toBe('recovered')
  })

  it('allows another attempt after runtime initialization fails', async () => {
    const failure = new Error('synthetic initialization failure')
    mocks.initializationError = failure
    mocks.removeBackground.mockResolvedValue('recovered')
    const { removeBackground } = await import('../../../src/utils/background-removal')
    await expect(removeBackground(new Blob(['first']))).rejects.toBe(failure)
    await expect(removeBackground(new Blob(['second']))).resolves.toBe('recovered')
    expect(mocks.onnxLoaded).toHaveBeenCalledTimes(2)
  })
})
