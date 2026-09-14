import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { ClothesService } from '@/services/clothesService'
import { CLOTHING_PLACEHOLDER_URL } from '@/utils/clothing-image'

const fixture = vi.hoisted(() => ({ rows: [], updates: [], save: vi.fn(), uploadImage: vi.fn() }))
vi.mock('@/lib/cloudinary', () => ({ cloudinary: { uploadImage: fixture.uploadImage } }))
vi.mock('@/lib/supabase', () => ({
  handleSupabaseError: error => { throw error },
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'fixture-owner' } }, error: null }) },
    rpc: async () => ({ data: true, error: null }),
    from: () => ({ update: row => {
      fixture.updates.push(row)
      const query = { eq: () => query, select: () => query, single: fixture.save }
      return query
    }, insert: row => {
      fixture.rows.push(row)
      return { select: () => ({ single: async () => ({ data: { ...row, id: 'fixture-item' }, error: null }) }) }
    } }),
  },
}))

describe('new clothing fallback records', () => {
  beforeEach(() => {
    fixture.rows.length = 0
    fixture.updates.length = 0
    fixture.save.mockReset()
    fixture.uploadImage.mockReset()
    for (const method of ['log', 'warn', 'error']) vi.spyOn(console, method).mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('uses a local fallback when no image is supplied while preserving owner/privacy', async () => {
    const result = await new ClothesService().addClothes({ name: 'Fixture shirt', category: 'top', privacy: 'private' })
    expect(result.success).toBe(true)
    expect(fixture.rows).toHaveLength(1)
    expect(fixture.rows[0]).toMatchObject({ owner_id: 'fixture-owner', privacy: 'private', image_url: CLOTHING_PLACEHOLDER_URL, thumbnail_url: CLOTHING_PLACEHOLDER_URL })
    expect(fixture.uploadImage).not.toHaveBeenCalled()
  })

  it('does not create a successful placeholder record when a selected file fails to upload', async () => {
    fixture.uploadImage.mockRejectedValue(new Error('Upload temporarily unavailable'))
    const image = new File(['fixture'], 'fixture.png', { type: 'image/png' })
    const draft = { name: 'Fixture shirt', category: 'top', image_file: image }
    await expect(new ClothesService().addClothes(draft)).rejects.toThrow(/upload/i)
    expect(fixture.rows).toHaveLength(0)
    expect(draft.image_file).toBe(image)
  })

  it('accepts an explicit retry of the retained file and creates one complete item', async () => {
    fixture.uploadImage.mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValue({ secure_url: 'https://fixture.invalid/image.png', thumbnail_url: 'https://fixture.invalid/thumb.png' })
    const draft = { name: 'Fixture shirt', category: 'top', image_file: new File(['fixture'], 'fixture.png', { type: 'image/png' }) }
    await expect(new ClothesService().addClothes(draft)).rejects.toThrow()
    const result = await new ClothesService().addClothes(draft)
    expect(result.success).toBe(true)
    expect(fixture.rows).toHaveLength(1)
    expect(fixture.rows[0].image_url).toBe('https://fixture.invalid/image.png')
    expect(fixture.uploadImage.mock.calls[0][0]).toBe(fixture.uploadImage.mock.calls[1][0])
  })

  it('keeps replacement files and prior URLs in the caller draft after a database failure', async () => {
    const original = new File(['original'], 'original.jpg', { type: 'image/jpeg' })
    const processed = new File(['processed'], 'processed.png', { type: 'image/png' })
    const draft = { name: 'Updated shirt', original_file: original, image_file: processed,
      image_url: 'https://fixture.invalid/old.png', thumbnail_url: 'https://fixture.invalid/old-thumb.png' }
    const before = { ...draft }
    fixture.uploadImage.mockResolvedValue({ secure_url: 'https://fixture.invalid/new.png', thumbnail_url: 'https://fixture.invalid/new-thumb.png' })
    fixture.save.mockResolvedValueOnce({ error: new Error('Database unavailable') })
      .mockResolvedValue({ data: { id: 'fixture-item' }, error: null })
    const service = new ClothesService()
    await expect(service.updateClothes('fixture-item', draft)).rejects.toThrow('Database unavailable')
    expect(draft).toEqual(before)
    expect(draft.image_file).toBe(processed)
    expect(draft.original_file).toBe(original)
    expect(fixture.updates[0]).toEqual({ name: 'Updated shirt', image_url: 'https://fixture.invalid/new.png', thumbnail_url: 'https://fixture.invalid/new-thumb.png' })
    expect((await service.updateClothes('fixture-item', draft)).success).toBe(true)
    expect(fixture.uploadImage.mock.calls[1][0]).toBe(processed)
    expect(draft).toEqual(before)
  })
})
