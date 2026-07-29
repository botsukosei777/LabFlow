import nodemailer from 'nodemailer';
import db from '../db/database.js';

function getSettings(): Record<string, string> {
  const rows = db.prepare('SELECT * FROM settings').all() as any[];
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

export function createTransporter() {
  const settings = getSettings();
  
  if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_pass) {
    return null;
  }
  
  return nodemailer.createTransport({
    host: settings.smtp_host,
    port: parseInt(settings.smtp_port || '587'),
    secure: settings.smtp_secure === 'true',
    auth: {
      user: settings.smtp_user,
      pass: settings.smtp_pass,
    },
  });
}

export async function sendEmail(subject: string, html: string): Promise<boolean> {
  const settings = getSettings();
  const transporter = createTransporter();
  
  if (!transporter || !settings.notification_email) {
    console.log('[Email] SMTP not configured, skipping email');
    return false;
  }
  
  try {
    await transporter.sendMail({
      from: `"LabFlow" <${settings.smtp_user}>`,
      to: settings.notification_email,
      subject,
      html,
    });
    console.log(`[Email] Sent: ${subject}`);
    return true;
  } catch (error) {
    console.error('[Email] Error:', error);
    return false;
  }
}

export async function sendTestEmail(): Promise<boolean> {
  const settings = getSettings();
  return sendEmail(
    'LabFlow テストメール',
    `<div style="font-family: sans-serif; padding: 20px;">
      <h2>🧪 LabFlow</h2>
      <p>メール通知が正常に設定されました。</p>
      <p style="color: #666;">Email notifications are configured correctly.</p>
      <hr/>
      <p style="color: #999; font-size: 12px;">Sent from LabFlow at ${new Date().toLocaleString('ja-JP')}</p>
    </div>`
  );
}
