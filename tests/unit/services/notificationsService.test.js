// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const query = {
    delete: vi.fn().mockReturnThis(),
    lt: vi.fn().mockResolvedValue({ error: null }),
  }
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }
  return {
    query,
    channel,
    supabase: {
      from: vi.fn(() => query),
      rpc: vi.fn().mockResolvedValue({ error: null }),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }) },
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mocks.supabase,
  isSupabaseConfigured: true,
  handleSupabaseError: vi.fn(),
}))

describe('notification retention and subscriptions', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('does not delete notification history or start cleanup timers when services load', async () => {
    const { NotificationsService } = await import('@/services/notificationsService')
    new NotificationsService()
    new NotificationsService()
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000)

    expect(mocks.supabase.from).not.toHaveBeenCalled()
    expect(mocks.supabase.rpc).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps authenticated realtime notification delivery and unsubscription', async () => {
    const { NotificationsService } = await import('@/services/notificationsService')
    const service = new NotificationsService()
    const listener = vi.fn()
    const subscription = await service.subscribe(listener)
    expect(mocks.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: 'recipient_id=eq.test-user' },
      expect.any(Function),
    )
    const payload = { eventType: 'INSERT', new: { id: 'notice-1' } }
    mocks.channel.on.mock.calls[0][2](payload)
    expect(listener).toHaveBeenCalledWith(payload)
    service.unsubscribe(subscription)
    expect(mocks.supabase.removeChannel).toHaveBeenCalledWith(mocks.channel)
  })
})
