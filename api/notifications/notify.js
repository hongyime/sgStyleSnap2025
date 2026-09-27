// api/notifications/notify.js
import Brevo from '@getbrevo/brevo';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Optional Supabase server client for status updates and idempotency
// Reuse public Vite URL if server-side URL not explicitly set
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabase = !!(supabaseUrl && supabaseServiceKey);
const supabase = hasSupabase ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } }) : null;

async function getNotificationById(id) {
  if (!supabase || !id) return null;
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch (_) {
    return null;
  }
}

async function markEmailSent(id) {
  if (!supabase || !id) return;
  try {
    await supabase
      .from('notifications')
      .update({ email_status: 'email_sent', email_sent_at: new Date().toISOString() })
      .eq('id', id);
  } catch (_) {
    // ignore
  }
}

async function markEmailError(id, errMessage) {
  if (!supabase || !id) return;
  try {
    await supabase
      .from('notifications')
      .update({ email_status: 'email_error', email_error: String(errMessage || '').slice(0, 500) })
      .eq('id', id);
  } catch (_) {
    // ignore
  }
}

export default async function handler(req, res) {
  // CORS — restrict to same origin (this endpoint is internal only)
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://sgstylesnap.vercel.app';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Internal-Secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: require shared secret to prevent abuse of this email-sending endpoint
  const internalSecret = process.env.NOTIFY_INTERNAL_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && !internalSecret) {
    // Misconfigured production deployment — fail closed
    console.error('NOTIFY_INTERNAL_SECRET is not set in production. Rejecting request.');
    return res.status(401).json({ error: 'Server misconfiguration: endpoint not properly secured' });
  }

  if (internalSecret) {
    const provided = req.headers['x-internal-secret'];
    if (!provided || provided !== internalSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else {
    // Dev mode — no secret set, allow but warn
    console.warn('NOTIFY_INTERNAL_SECRET not set — running in open dev mode');
  }

  try {
    const rawBody = req.body;
    const payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody || {};

    const recipientEmail = payload?.recipient_email;
    const notificationId = payload?.notification_id || null;
    const notificationType = (payload?.notification_type || '').toLowerCase().replace(/\s+/g, '_');

    // Simple template registry; payload values override templates if provided
    const templates = {
      new_friend: {
        subject: 'You have a new friend on StyleSnap',
        html: `
          <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
            <h2 style="margin:0 0 12px;">New friend added 🎉</h2>
            <p style="margin:0 0 12px;">${payload?.actor_name || 'Someone'} just became your friend.</p>
            <p style="margin:0 0 12px;">Open the app to say hello and view their closet.</p>
          </div>
        `
      },
      friend_request: {
        subject: 'You received a friend request',
        html: `
          <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
            <h2 style="margin:0 0 12px;">New friend request</h2>
            <p style="margin:0 0 12px;">${payload?.actor_name || 'A user'} sent you a friend request.</p>
            <p style="margin:0 0 12px;">Open the app to accept or decline.</p>
          </div>
        `
      },
      comment: {
        subject: 'New comment on your outfit',
        html: `
          <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
            <h2 style="margin:0 0 12px;">New comment 💬</h2>
            <p style="margin:0 0 12px;">${payload?.actor_name || 'A friend'} commented: “${payload?.comment_preview || 'View in app'}”.</p>
            <p style="margin:0 0 12px;">Open the app to reply.</p>
          </div>
        `
      },
      like: {
        subject: 'Someone liked your outfit',
        html: `
          <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
            <h2 style="margin:0 0 12px;">Your outfit got a like ❤️</h2>
            <p style="margin:0 0 12px;">${payload?.actor_name || 'A friend'} liked your outfit.</p>
          </div>
        `
      }
    };

    const templ = templates[notificationType] || null;
    const subject = payload?.subject || templ?.subject;
    const htmlContent = payload?.content_html || templ?.html;

    if (!recipientEmail || !subject || !htmlContent) {
      return res.status(400).json({
        error: 'Invalid payload',
        detail: 'Required fields: recipient_email, subject, content_html'
      });
    }

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'Server misconfiguration',
        detail: 'BREVO_API_KEY is not set'
      });
    }

    // Idempotency: skip if already sent
    if (notificationId && hasSupabase) {
      const existing = await getNotificationById(notificationId);
      if (existing && existing.email_status === 'email_sent') {
        return res.status(200).json({ success: true, skipped: true });
      }
    }

    const transactionalEmailsApi = new Brevo.TransactionalEmailsApi();
    transactionalEmailsApi.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);

    const email = new Brevo.SendSmtpEmail();
    email.to = [{ email: recipientEmail }];
    email.sender = { name: 'SG Style Snap', email: 'noreply-sgstylesnap@hong-yi.me' };
    email.subject = subject;
    email.htmlContent = htmlContent;

    // Lightweight idempotency metadata (does not prevent duplicates without storage,
    // but helps tracing/diagnostics in Brevo and logs)
    const dedupeBasis = `${recipientEmail}|${notificationType}|${subject}|${String(htmlContent).slice(0, 256)}`;
    const dedupeHash = createHash('sha256').update(dedupeBasis).digest('hex');
    email.headers = {
      ...(email.headers || {}),
      'X-Notification-ID': notificationId || '',
      'X-Idempotency-Key': dedupeHash,
      'X-Notification-Type': notificationType || ''
    };

    await transactionalEmailsApi.sendTransacEmail(email);

    if (notificationId && hasSupabase) {
      await markEmailSent(notificationId);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    const message = err?.message || 'Unknown error';
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const notificationId = payload?.notification_id || null;
    if (notificationId && hasSupabase) {
      await markEmailError(notificationId, message);
    }
    return res.status(500).json({ error: 'Email dispatch failed', detail: message });
  }
}


