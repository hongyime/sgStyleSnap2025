// Supabase Edge Function: Send Email Notifications
// Deploy with: supabase functions deploy send-email-notification --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface NotificationData {
  id: string
  recipient_id: string
  actor_id?: string
  type: string
  reference_id?: string
  message?: string
  created_at: string
}

interface EmailTemplate {
  subject: string
  html: string
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

/**
 * Get email templates for different notification types
 */
function getEmailTemplate(notificationType: string, actorName: string = 'A user'): EmailTemplate | null {
  // Construct logo URL
  // Priority: 1. SITE_URL env var, 2. Extract from SUPABASE_URL (if it's a website URL)
  // For production, set SITE_URL in Supabase Edge Function settings: https://your-domain.com
  let siteUrl = Deno.env.get('SITE_URL')
  
  if (!siteUrl) {
    // Fallback: try to extract site URL from SUPABASE_URL
    // If SUPABASE_URL contains a domain pattern, we can use it
    // Note: This is a fallback - ideally SITE_URL should be set explicitly
    const supabaseUrl = SUPABASE_URL
    // Remove any API paths
    siteUrl = supabaseUrl.replace('/functions/v1', '').replace('/rest/v1', '').replace('/auth/v1', '')
  }
  
  // Ensure URL doesn't end with slash
  siteUrl = siteUrl.replace(/\/$/, '')
  const logoUrl = `${siteUrl}/icons/favicon-192x192.png`
  
  console.log('📧 Logo URL constructed:', logoUrl)
  
  const templates: Record<string, EmailTemplate> = {
    friend_request: {
      subject: 'You received a friend request on StyleSnap',
      html: `
        <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width:600px; margin:0 auto; padding:20px;">
          <!-- Logo/Header -->
          <div style="text-align:center; margin-bottom:24px;">
            <img src="${logoUrl}" alt="StyleSnap Logo" style="width:64px; height:64px; margin-bottom:12px; display:block; margin-left:auto; margin-right:auto;" />
            <h1 style="margin:0; color:#1f2937; font-size:24px; font-weight:bold;">StyleSnap</h1>
          </div>
          <h2 style="margin:0 0 12px; color:#1f2937;">New friend request 👋</h2>
          <p style="margin:0 0 12px; color:#374151; font-size:16px;">${actorName} sent you a friend request on StyleSnap.</p>
          <p style="margin:0 0 12px; color:#374151; font-size:16px;">Open the app to accept or decline.</p>
        </div>
      `
    },
    friend_request_accepted: {
      subject: 'Your friend request was accepted on StyleSnap',
      html: `
        <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width:600px; margin:0 auto; padding:20px;">
          <!-- Logo/Header -->
          <div style="text-align:center; margin-bottom:24px;">
            <img src="${logoUrl}" alt="StyleSnap Logo" style="width:64px; height:64px; margin-bottom:12px; display:block; margin-left:auto; margin-right:auto;" />
            <h1 style="margin:0; color:#1f2937; font-size:24px; font-weight:bold;">StyleSnap</h1>
          </div>
          <h2 style="margin:0 0 12px; color:#1f2937;">Friend request accepted 🎉</h2>
          <p style="margin:0 0 12px; color:#374151; font-size:16px;">${actorName} accepted your friend request on StyleSnap.</p>
          <p style="margin:0 0 12px; color:#374151; font-size:16px;">You can now view each other's closets and create outfits together!</p>
        </div>
      `
    },
    outfit_like: {
      subject: 'Someone liked your outfit on StyleSnap',
      html: `
        <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width:600px; margin:0 auto; padding:20px;">
          <!-- Logo/Header -->
          <div style="text-align:center; margin-bottom:24px;">
            <img src="${logoUrl}" alt="StyleSnap Logo" style="width:64px; height:64px; margin-bottom:12px; display:block; margin-left:auto; margin-right:auto;" />
            <h1 style="margin:0; color:#1f2937; font-size:24px; font-weight:bold;">StyleSnap</h1>
          </div>
          <h2 style="margin:0 0 12px; color:#1f2937;">Your outfit got a like ❤️</h2>
          <p style="margin:0 0 12px; color:#374151; font-size:16px;">${actorName} liked your outfit on StyleSnap.</p>
          <p style="margin:0 0 12px; color:#374151; font-size:16px;">Open the app to see which outfit they liked.</p>
        </div>
      `
    },
    item_like: {
      subject: 'Someone liked your item on StyleSnap',
      html: `
        <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width:600px; margin:0 auto; padding:20px;">
          <!-- Logo/Header -->
          <div style="text-align:center; margin-bottom:24px;">
            <img src="${logoUrl}" alt="StyleSnap Logo" style="width:64px; height:64px; margin-bottom:12px; display:block; margin-left:auto; margin-right:auto;" />
            <h1 style="margin:0; color:#1f2937; font-size:24px; font-weight:bold;">StyleSnap</h1>
          </div>
          <h2 style="margin:0 0 12px; color:#1f2937;">Your item got a like ❤️</h2>
          <p style="margin:0 0 12px; color:#374151; font-size:16px;">${actorName} liked an item in your closet on StyleSnap.</p>
          <p style="margin:0 0 12px; color:#374151; font-size:16px;">Open the app to see which item they liked.</p>
        </div>
      `
    },
    outfit_shared: {
      subject: 'A friend shared an outfit with you on StyleSnap',
      html: `
        <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width:600px; margin:0 auto; padding:20px;">
          <!-- Logo/Header -->
          <div style="text-align:center; margin-bottom:24px;">
            <img src="${logoUrl}" alt="StyleSnap Logo" style="width:64px; height:64px; margin-bottom:12px; display:block; margin-left:auto; margin-right:auto;" />
            <h1 style="margin:0; color:#1f2937; font-size:24px; font-weight:bold;">StyleSnap</h1>
          </div>
          <h2 style="margin:0 0 12px; color:#1f2937;">Outfit shared with you 👗</h2>
          <p style="margin:0 0 12px; color:#374151; font-size:16px;">${actorName} shared an outfit with you on StyleSnap.</p>
          <p style="margin:0 0 12px; color:#374151; font-size:16px;">Open the app to view the shared outfit.</p>
        </div>
      `
    },
    friend_outfit_suggestion: {
      subject: 'You have an outfit suggestion on StyleSnap',
      html: `
        <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width:600px; margin:0 auto; padding:20px;">
          <!-- Logo/Header -->
          <div style="text-align:center; margin-bottom:24px;">
            <img src="${logoUrl}" alt="StyleSnap Logo" style="width:64px; height:64px; margin-bottom:12px; display:block; margin-left:auto; margin-right:auto;" />
            <h1 style="margin:0; color:#1f2937; font-size:24px; font-weight:bold;">StyleSnap</h1>
          </div>
          <h2 style="margin:0 0 12px; color:#1f2937;">Outfit suggestion 💡</h2>
          <p style="margin:0 0 12px; color:#374151; font-size:16px;">${actorName} created an outfit suggestion using items from your closet.</p>
          <p style="margin:0 0 12px; color:#374151; font-size:16px;">Open the app to approve or reject the suggestion.</p>
        </div>
      `
    },
    outfit_comment: {
      subject: 'New comment on your outfit on StyleSnap',
      html: `
        <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width:600px; margin:0 auto; padding:20px;">
          <!-- Logo/Header -->
          <div style="text-align:center; margin-bottom:24px;">
            <img src="${logoUrl}" alt="StyleSnap Logo" style="width:64px; height:64px; margin-bottom:12px; display:block; margin-left:auto; margin-right:auto;" />
            <h1 style="margin:0; color:#1f2937; font-size:24px; font-weight:bold;">StyleSnap</h1>
          </div>
          <h2 style="margin:0 0 12px; color:#1f2937;">New comment 💬</h2>
          <p style="margin:0 0 12px; color:#374151; font-size:16px;">${actorName} commented on your outfit on StyleSnap.</p>
          <p style="margin:0 0 12px; color:#374151; font-size:16px;">Open the app to view and reply to the comment.</p>
        </div>
      `
    }
  }

  return templates[notificationType] || null
}

/**
 * Send email via Brevo API
 */
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  notificationId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      sender: {
        name: 'SG StyleSnap',
        email: 'noreply-sgstylesnap@hong-yi.me'
      },
      to: [{ email: to }],
      // Temporarily disabled CC for testing
      subject,
      htmlContent: html,
      headers: {
        'X-Notification-ID': notificationId || '',
        'X-Notification-Type': 'email'
      }
    }

    console.log('📧 Brevo API payload:', JSON.stringify(payload, null, 2))
    console.log('📧 Brevo API key exists:', !!BREVO_API_KEY)
    console.log('📧 Brevo API key length:', BREVO_API_KEY?.length || 0)
    console.log('📧 Brevo API URL: https://api.brevo.com/v3/smtp/email')

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    console.log('📧 Brevo API response status:', response.status)
    console.log('📧 Brevo API response statusText:', response.statusText)
    console.log('📧 Brevo API response headers:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2))

    if (!response.ok) {
      const errorText = await response.text()
      console.error('📧 ❌ Brevo API error response:', errorText)
      throw new Error(`Brevo API error: ${response.status} - ${errorText}`)
    }

    const responseData = await response.text()
    console.log('📧 ✅ Brevo API success response:', responseData)
    
    // Parse Brevo response to validate it contains a messageId
    try {
      const brevoResponse = JSON.parse(responseData)
      if (brevoResponse.messageId) {
        console.log('📧 ✅ Brevo messageId received:', brevoResponse.messageId)
      } else {
        console.warn('📧 ⚠️  Brevo response missing messageId:', brevoResponse)
      }
    } catch (parseError) {
      console.warn('📧 ⚠️  Could not parse Brevo response as JSON:', responseData)
    }

    return { success: true }
  } catch (error) {
    console.error('📧 ❌ Error sending email:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('📧 ❌ Error details:', {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    })
    return { success: false, error: errorMessage }
  }
}

/**
 * Check if user should receive email notification
 * @param supabase - Supabase client
 * @param userId - Recipient user ID (the one receiving the email)
 * @param notificationType - Type of notification
 * @param senderHasEnoughFriends - Whether the sender has 5+ friends (required to send emails)
 */
async function shouldSendEmail(
  supabase: any,
  userId: string,
  notificationType: string,
  senderHasEnoughFriends: boolean = true
): Promise<boolean> {
  try {
    console.log('📧 shouldSendEmail called:')
    console.log('📧   userId:', userId)
    console.log('📧   notificationType:', notificationType)
    console.log('📧   senderHasEnoughFriends:', senderHasEnoughFriends)

    // First, check if sender has 5+ friends (required to send email notifications)
    // Recipients don't need 5 friends to receive emails
    if (!senderHasEnoughFriends) {
      console.log('📧 ❌ Sender does not have 5+ friends, skipping email')
      return false
    }

    // Get recipient's preferences for receiving emails
    // Note: email_enabled controls SENDING emails, not receiving
    // For receiving, we only check the individual notification type preferences
    console.log('📧 Fetching recipient preferences...')
    const { data: preferences, error } = await supabase
      .from('notification_preferences')
      .select('friend_requests, friend_accepted, outfit_likes, item_likes, outfit_comments, friend_outfit_suggestions')
      .eq('user_id', userId)
      .single()

    if (error) {
      console.log('📧 ⚠️  Error fetching preferences (defaulting to enabled):', error)
    } else {
      console.log('📧 Preferences found:', JSON.stringify(preferences, null, 2))
    }

    // If no preferences, default to enabled (all users can receive emails by default)
    if (error || !preferences) {
      console.log('📧 ✅ No preferences found, defaulting to enabled (all users can receive emails)')
      return true
    }

    // Check type-specific preferences for receiving emails
    // These preferences control whether the user wants to RECEIVE emails for each type
    let result = true
    switch (notificationType) {
      case 'friend_request':
        result = preferences.friend_requests !== false
        console.log('📧   friend_requests preference:', preferences.friend_requests, '→ result:', result)
        break
      case 'friend_request_accepted':
        result = preferences.friend_accepted !== false
        console.log('📧   friend_accepted preference:', preferences.friend_accepted, '→ result:', result)
        break
      case 'outfit_like':
        result = preferences.outfit_likes !== false
        console.log('📧   outfit_likes preference:', preferences.outfit_likes, '→ result:', result)
        break
      case 'item_like':
        result = preferences.item_likes !== false
        console.log('📧   item_likes preference:', preferences.item_likes, '→ result:', result)
        break
      case 'outfit_comment':
        result = preferences.outfit_comments !== false
        console.log('📧   outfit_comments preference:', preferences.outfit_comments, '→ result:', result)
        break
      case 'friend_outfit_suggestion':
      case 'outfit_shared':
        result = preferences.friend_outfit_suggestions !== false
        console.log('📧   friend_outfit_suggestions preference:', preferences.friend_outfit_suggestions, '→ result:', result)
        break
      default:
        console.log('📧   Unknown notification type, defaulting to enabled')
        result = true
    }

    console.log('📧 Final shouldSendEmail result:', result)
    return result
  } catch (error) {
    console.error('📧 ❌ Error checking email preferences:', error)
    // Default to sending on error
    return true
  }
}

serve(async (req) => {
  const startTime = Date.now()
  console.log('📧 ========== EMAIL NOTIFICATION FUNCTION CALLED ==========')
  console.log('📧 Method:', req.method)
  console.log('📧 URL:', req.url)
  console.log('📧 Headers:', JSON.stringify(Object.fromEntries(req.headers.entries()), null, 2))
  
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      console.log('📧 CORS preflight request, returning OK')
      return new Response('ok', { headers: corsHeaders })
    }

    // Check environment variables
    console.log('📧 Environment check:')
    console.log('📧   BREVO_API_KEY exists:', !!BREVO_API_KEY)
    console.log('📧   SUPABASE_URL exists:', !!SUPABASE_URL)
    console.log('📧   SUPABASE_SERVICE_KEY exists:', !!SUPABASE_SERVICE_KEY)
    console.log('📧   SUPABASE_URL value:', SUPABASE_URL)

    // Create Supabase client with service role key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    console.log('📧 Supabase client created')

    // Parse request body
    // Handle both direct HTTP calls and Supabase webhook payloads
    // Supabase Edge Function webhooks send the row data directly, which could be:
    // 1. Direct row data (flat structure)
    // 2. Webhook format with 'record' or 'new' field
    // 3. Nested in 'data' or 'payload' field
    let notificationData: NotificationData
    try {
      const bodyText = await req.text()
      console.log('📧 Raw request body:', bodyText)
      const parsedBody = JSON.parse(bodyText)
      console.log('📧 Parsed body:', JSON.stringify(parsedBody, null, 2))
      
      let record: any = null
      
      // Try different webhook payload formats
      if (parsedBody.record) {
        console.log('📧 Detected webhook format: record field')
        record = parsedBody.record
      } else if (parsedBody.new) {
        console.log('📧 Detected webhook format: new field')
        record = parsedBody.new
      } else if (parsedBody.data) {
        console.log('📧 Detected webhook format: data field')
        record = parsedBody.data
      } else if (parsedBody.payload) {
        console.log('📧 Detected webhook format: payload field')
        record = parsedBody.payload
      } else if (parsedBody.id && parsedBody.recipient_id && parsedBody.type) {
        // Direct row data (flat structure) - this is what Supabase Edge Function webhooks typically send
        console.log('📧 Detected direct row data format (Supabase Edge Function webhook)')
        record = parsedBody
      } else {
        // Last attempt: maybe the entire body is the record
        console.log('📧 Trying entire body as record')
        record = parsedBody
      }
      
      // Extract notification data from the record
      if (!record || !record.id || !record.recipient_id || !record.type) {
        console.error('📧 ❌ Invalid record structure:', JSON.stringify(record, null, 2))
        throw new Error('Invalid payload format: record missing required fields (id, recipient_id, type)')
      }
      
      notificationData = {
        id: record.id,
        recipient_id: record.recipient_id,
        actor_id: record.actor_id || null,
        type: record.type,
        reference_id: record.reference_id || null,
        message: record.custom_message || record.message || null,
        created_at: record.created_at
      }
      
      console.log('📧 Final notification data:', JSON.stringify(notificationData, null, 2))
    } catch (parseError) {
      console.error('📧 ❌ Error parsing request body:', parseError)
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body', details: parseError instanceof Error ? parseError.message : String(parseError) }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Validate required fields
    console.log('📧 Validating required fields...')
    console.log('📧   id:', notificationData.id)
    console.log('📧   recipient_id:', notificationData.recipient_id)
    console.log('📧   type:', notificationData.type)
    console.log('📧   actor_id:', notificationData.actor_id)
    
    if (!notificationData.id || !notificationData.recipient_id || !notificationData.type) {
      console.error('📧 ❌ Missing required fields')
      return new Response(
        JSON.stringify({ error: 'Missing required fields: id, recipient_id, type' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    console.log('📧 ✅ All required fields present')

    // Check if sender has 5+ friends (required to send email notifications)
    console.log('📧 Checking sender friend count...')
    let senderHasEnoughFriends = true
    if (notificationData.actor_id) {
      console.log('📧   Actor ID:', notificationData.actor_id)
      const { count: senderFriendsCount, error: friendsError } = await supabase
        .from('friends')
        .select('id', { count: 'exact', head: true })
        .or(`requester_id.eq.${notificationData.actor_id},receiver_id.eq.${notificationData.actor_id}`)
        .eq('status', 'accepted')
      
      if (friendsError) {
        console.error('📧 ❌ Error checking sender friends:', friendsError)
      } else {
        console.log('📧   Sender friends count:', senderFriendsCount)
        senderHasEnoughFriends = (senderFriendsCount || 0) >= 5
        console.log('📧   Sender has enough friends (5+):', senderHasEnoughFriends)
      }
    } else {
      console.log('📧   No actor_id, defaulting to senderHasEnoughFriends = true')
    }
    
    // Check if recipient should receive email (preferences check only, no friend count requirement)
    console.log('📧 Checking recipient email preferences...')
    console.log('📧   Recipient ID:', notificationData.recipient_id)
    console.log('📧   Notification type:', notificationData.type)
    console.log('📧   Sender has enough friends:', senderHasEnoughFriends)
    
    const shouldSend = await shouldSendEmail(
      supabase,
      notificationData.recipient_id,
      notificationData.type,
      senderHasEnoughFriends
    )

    console.log('📧 Should send email?', shouldSend)

    if (!shouldSend) {
      console.log('📧 ⏭️  Email skipped due to preferences or sender friend count')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Email skipped due to user preferences',
          debug: {
            senderHasEnoughFriends,
            notificationType: notificationData.type,
            recipientId: notificationData.recipient_id
          }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get recipient user info (for email)
    console.log('📧 Fetching recipient user info...')
    const { data: recipient, error: recipientError } = await supabase
      .from('users')
      .select('email, name')
      .eq('id', notificationData.recipient_id)
      .single()

    if (recipientError) {
      console.error('📧 ❌ Error fetching recipient:', recipientError)
      return new Response(
        JSON.stringify({ error: 'Recipient user not found or has no email', details: recipientError }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (!recipient || !recipient.email) {
      console.error('📧 ❌ Recipient has no email')
      console.log('📧   Recipient data:', recipient)
      return new Response(
        JSON.stringify({ error: 'Recipient user not found or has no email', recipient }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('📧 ✅ Recipient found:')
    console.log('📧   Email:', recipient.email)
    console.log('📧   Name:', recipient.name)

    // Get actor info (if exists)
    let actorName = 'A user'
    if (notificationData.actor_id) {
      console.log('📧 Fetching actor info...')
      const { data: actor, error: actorError } = await supabase
        .from('users')
        .select('name')
        .eq('id', notificationData.actor_id)
        .single()

      if (actorError) {
        console.warn('📧 ⚠️  Error fetching actor:', actorError)
      } else if (actor && actor.name) {
        actorName = actor.name
        console.log('📧   Actor name:', actorName)
      }
    }

    // Get email template
    console.log('📧 Getting email template for type:', notificationData.type)
    const template = getEmailTemplate(notificationData.type, actorName)
    if (!template) {
      console.error('📧 ❌ No template found for type:', notificationData.type)
      return new Response(
        JSON.stringify({ success: true, message: `No email template for type: ${notificationData.type}` }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    console.log('📧 ✅ Template found:')
    console.log('📧   Subject:', template.subject)

    // Send email
    console.log('📧 ========== CALLING BREVO API ==========')
    console.log('📧 To:', recipient.email)
    console.log('📧 Subject:', template.subject)
    console.log('📧 Notification ID:', notificationData.id)
    
    const emailResult = await sendEmail(
      recipient.email,
      template.subject,
      template.html,
      notificationData.id
    )

    console.log('📧 Email result:', JSON.stringify(emailResult, null, 2))

    // Update notification email status
    console.log('📧 Updating notification email status...')
    if (emailResult.success) {
      const { error: updateError } = await supabase
        .from('notifications')
        .update({
          email_status: 'email_sent',
          email_sent_at: new Date().toISOString()
        })
        .eq('id', notificationData.id)
      
      if (updateError) {
        console.error('📧 ❌ Error updating notification status:', updateError)
      } else {
        console.log('📧 ✅ Notification status updated to email_sent')
      }
    } else {
      const { error: updateError } = await supabase
        .from('notifications')
        .update({
          email_status: 'email_error',
          email_error: emailResult.error?.slice(0, 500)
        })
        .eq('id', notificationData.id)
      
      if (updateError) {
        console.error('📧 ❌ Error updating notification error status:', updateError)
      } else {
        console.log('📧 ⚠️  Notification status updated to email_error')
      }
    }

    const duration = Date.now() - startTime
    console.log('📧 ========== FUNCTION COMPLETE ==========')
    console.log('📧 Duration:', duration, 'ms')
    console.log('📧 Success:', emailResult.success)
    console.log('📧 =========================================')

    return new Response(
      JSON.stringify({
        success: emailResult.success,
        message: emailResult.success ? 'Email sent successfully' : emailResult.error,
        debug: {
          notificationId: notificationData.id,
          recipientId: notificationData.recipient_id,
          type: notificationData.type,
          duration
        }
      }),
      {
        status: emailResult.success ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('📧 ❌ ========== FUNCTION ERROR ==========')
    console.error('📧 ❌ Error in send-email-notification:', error)
    console.error('📧 ❌ Error type:', error instanceof Error ? error.constructor.name : typeof error)
    console.error('📧 ❌ Error message:', error instanceof Error ? error.message : String(error))
    console.error('📧 ❌ Error stack:', error instanceof Error ? error.stack : undefined)
    console.error('📧 ❌ Duration before error:', duration, 'ms')
    console.error('📧 ❌ =========================================')
    
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        debug: {
          duration,
          errorType: error instanceof Error ? error.constructor.name : typeof error
        }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

