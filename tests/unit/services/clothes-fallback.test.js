import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { ClothesService } from '@/services/clothesService'
import { CLOTHING_PLACEHOLDER_URL } from '@/utils/clothing-image'

const fixture = vi.hoisted(() => ({ rows: [], uploadImage: vi.fn() }))
vi.mock('@/lib/cloudinary', () => ({ cloudinary: { uploadImage: fixture.uploadImage } }))
vi.mock('@/lib/supabase', () => ({
  handleSupabaseError: error => { throw error },
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'fixture-owner' } }, error: null }) },
    rpc: async () => ({ data: true, error: null }),
    from: () => ({ insert: row => {
      fixture.rows.push(row)
      return { select: () => ({ single: async () => ({ data: { ...row, id: 'fixture-item' }, error: null }) }) }
    } }),
  },
}))

describe('new clothing fallback records', () => {
  beforeEach(() => {
    fixture.rows.length = 0
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

  it('uses the same valid fallback for the existing recoverable upload-error path', async () => {
    fixture.uploadImage.mockRejectedValue(new Error('Upload temporarily unavailable'))
    const result = await new ClothesService().addClothes({ name: 'Fixture shirt', category: 'top', image_file: new File(['fixture'], 'fixture.png', { type: 'image/png' }) })
    expect(result.success).toBe(true)
    expect(fixture.rows[0]).toMatchObject({ privacy: 'friends', image_url: CLOTHING_PLACEHOLDER_URL, thumbnail_url: CLOTHING_PLACEHOLDER_URL })
  })
})
