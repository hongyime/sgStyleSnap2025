import { supabase, handleSupabaseError } from '@/lib/supabase'

export class NotificationsService {
  constructor() {
    this.subscriptions = new Map()
  }

  async getNotifications(filters = {}) {
    try {
      console.log('🔔 NotificationsService: Getting notifications with filters:', filters)
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        console.error('🔔 NotificationsService: Not authenticated:', userError)
        throw new Error('Not authenticated')
      }

      console.log('🔔 NotificationsService: User authenticated:', user.id)

      let query = supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })

      if (filters.limit) {
        query = query.limit(filters.limit)
      }

      if (filters.unread_only) {
        query = query.eq('is_read', false)
      }

      const { data, error } = await query

      if (error) {
        console.error('🔔 NotificationsService: Error fetching notifications:', error)
        throw error
      }
      
      console.log('🔔 NotificationsService: Fetched notifications:', data)
      return data || []
    } catch (error) {
      console.error('🔔 NotificationsService: Error in getNotifications:', error)
      handleSupabaseError(error, 'get notifications')
    }
  }

  async markAsRead(notificationId) {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('recipient_id', user.id)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      handleSupabaseError(error, 'mark notification as read')
    }
  }

  async markAsUnread(notificationId) {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: false, read_at: null })
        .eq('id', notificationId)
        .eq('recipient_id', user.id)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      handleSupabaseError(error, 'mark notification as unread')
    }
  }

  async markAllAsRead() {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('notifications')
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('recipient_id', user.id)
        .eq('is_read', false)
        .select()

      if (error) throw error
      return data
    } catch (error) {
      handleSupabaseError(error, 'mark all notifications as read')
    }
  }

  async deleteNotification(notificationId) {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .eq('recipient_id', user.id)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      handleSupabaseError(error, 'delete notification')
    }
  }

  async getUnreadCount() {
    try {
      console.log('🔔 NotificationsService: Getting unread count')
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        console.error('🔔 NotificationsService: Not authenticated:', userError)
        throw new Error('Not authenticated')
      }

      console.log('🔔 NotificationsService: User authenticated:', user.id)

      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false)

      if (error) {
        console.error('🔔 NotificationsService: Error getting unread count:', error)
        throw error
      }
      
      console.log('🔔 NotificationsService: Unread count:', count)
      return count || 0
    } catch (error) {
      console.error('🔔 NotificationsService: Error in getUnreadCount:', error)
      handleSupabaseError(error, 'get unread count')
    }
  }

  async sendNotification(notificationData) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert({
          recipient_id: notificationData.recipient_id,
          actor_id: notificationData.actor_id,
          type: notificationData.type,
          reference_id: notificationData.reference_id,
          custom_message: notificationData.custom_message,
          is_read: false
        })
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      handleSupabaseError(error, 'send notification')
    }
  }

  async subscribe(callback) {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) return null

      const subscription = supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${user.id}`
          },
          (payload) => {
            callback(payload)
          }
        )
        .subscribe()

      this.subscriptions.set(callback, subscription)
      return subscription
    } catch (error) {
      console.error('Error setting up notification subscription:', error)
      return null
    }
  }

  unsubscribe(subscription) {
    if (subscription) {
      supabase.removeChannel(subscription)
    }
  }

  // Notification types and templates
  static getNotificationTemplates() {
    return {
      friend_request: {
        title: 'New Friend Request',
        message: 'Someone sent you a friend request',
        icon: 'user-plus',
        action: 'View request'
      },
      friend_request_accepted: {
        title: 'Friend Request Accepted',
        message: 'Your friend request was accepted',
        icon: 'user-check',
        action: 'View profile'
      },
      outfit_shared: {
        title: 'Outfit Shared',
        message: 'Someone shared an outfit with you',
        icon: 'share',
        action: 'View outfit'
      },
      friend_outfit_suggestion: {
        title: 'Outfit Suggestion',
        message: 'Someone created an outfit suggestion using your items',
        icon: 'sparkles',
        action: 'View suggestion'
      },
      outfit_like: {
        title: 'Outfit Liked',
        message: 'Someone liked your outfit',
        icon: 'heart',
        action: 'View outfit'
      },
      item_like: {
        title: 'Item Liked',
        message: 'Someone liked your closet item',
        icon: 'heart',
        action: 'View item'
      }
    }
  }

  // Helper method to create notification with template
  async createNotificationFromTemplate(type, recipientId, actorId = null, referenceId = null, customMessage = null) {
    const templates = NotificationsService.getNotificationTemplates()
    const template = templates[type]
    
    if (!template) {
      throw new Error(`Unknown notification type: ${type}`)
    }

    return this.sendNotification({
      recipient_id: recipientId,
      actor_id: actorId,
      type,
      reference_id: referenceId,
      custom_message: customMessage
    })
  }

  // Friend request management
  async acceptFriendRequest(friendshipId) {
    try {
      const { data, error } = await supabase.rpc('accept_friend_request', {
        p_friendship_id: friendshipId
      })

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      handleSupabaseError(error, 'accept friend request')
      return { success: false, error }
    }
  }

  async rejectFriendRequest(friendshipId) {
    try {
      const { data, error } = await supabase.rpc('reject_friend_request', {
        p_friendship_id: friendshipId
      })

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      handleSupabaseError(error, 'reject friend request')
      return { success: false, error }
    }
  }

  // Outfit sharing
  async shareOutfitWithFriends(outfitId, recipientIds, message = null) {
    // TODO: outfit_shares table and RPCs not yet implemented in database
    console.warn('NotificationsService: shareOutfitWithFriends is not yet implemented')
    return { success: false, error: 'Outfit sharing feature is not yet implemented' }
  }

  async getSharedOutfits(limit = 20, offset = 0) {
    // TODO: outfit_shares table and get_shared_outfits RPC not yet implemented in database
    console.warn('NotificationsService: getSharedOutfits is not yet implemented')
    return []
  }

  async markOutfitShareViewed(shareId) {
    // TODO: outfit_shares table and mark_outfit_share_viewed RPC not yet implemented in database
    console.warn('NotificationsService: markOutfitShareViewed is not yet implemented')
    return { success: false, error: 'Outfit sharing feature is not yet implemented' }
  }

  // Create friend outfit suggestion
  async createFriendOutfitSuggestion(friendId, outfitItems, message = null) {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('Not authenticated')

      console.log('NotificationsService: Creating friend outfit suggestion')
      console.log('Friend ID:', friendId)
      console.log('Outfit items:', outfitItems)
      console.log('Message:', message)

      // Create the friend outfit suggestion record
      // This will trigger a notification via database trigger
      const { data, error } = await supabase
        .from('friend_outfit_suggestions')
        .insert({
          owner_id: friendId, // The friend who owns the items
          suggester_id: user.id, // Current user who is creating the suggestion
          outfit_items: outfitItems, // Array of items with positions
          message: message,
          status: 'pending'
        })
        .select()
        .single()

      if (error) {
        console.error('NotificationsService: Error creating friend outfit suggestion:', error)
        throw error
      }

      console.log('NotificationsService: Friend outfit suggestion created:', data)
      return { success: true, data }
    } catch (error) {
      console.error('NotificationsService: Error in createFriendOutfitSuggestion:', error)
      handleSupabaseError(error, 'create friend outfit suggestion')
      return { success: false, error }
    }
  }

  // Get notification preferences
  async getNotificationPreferences() {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error) {
        // If preferences don't exist, return defaults
        if (error.code === 'PGRST116') {
          return {
            email_enabled: true,
            friend_requests: true,
            friend_accepted: true,
            outfit_likes: true,
            item_likes: true,
            outfit_comments: true,
            friend_outfit_suggestions: true
          }
        }
        throw error
      }

      return data || {
        email_enabled: true,
        friend_requests: true,
        friend_accepted: true,
        outfit_likes: true,
        item_likes: true,
        outfit_comments: true,
        friend_outfit_suggestions: true
      }
    } catch (error) {
      console.error('NotificationsService: Error getting notification preferences:', error)
      handleSupabaseError(error, 'get notification preferences')
      // Return defaults on error
      return {
        email_enabled: true,
        friend_requests: true,
        friend_accepted: true,
        outfit_likes: true,
        item_likes: true,
        outfit_comments: true,
        friend_outfit_suggestions: true
      }
    }
  }

  // Update notification preferences
  async updateNotificationPreferences(preferences) {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('Not authenticated')

      // Upsert preferences (insert or update)
      const { data, error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: user.id,
          ...preferences,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        })
        .select()
        .single()

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('NotificationsService: Error updating notification preferences:', error)
      handleSupabaseError(error, 'update notification preferences')
      return { success: false, error }
    }
  }
}

export const notificationsService = new NotificationsService()
