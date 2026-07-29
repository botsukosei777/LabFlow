import cron from 'node-cron';
import db from '../db/database.js';
import { sendEmail } from './email.js';

function getSettings(): Record<string, string> {
  const rows = db.prepare('SELECT * FROM settings').all() as any[];
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// Format date in Japanese
function formatDateJa(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// Daily experiment plan email (default: 0:00)
function sendDailyPlanEmail() {
  const today = new Date().toISOString().split('T')[0];
  const dateLabel = formatDateJa(today);
  
  const blocks = db.prepare(`
    SELECT sb.*, se.label, se.mode,
           p.name as protocol_name, e.name as experiment_type_name,
           b.name as block_name, b.description as block_description
    FROM scheduled_blocks sb
    JOIN scheduled_experiments se ON sb.scheduled_experiment_id = se.id
    JOIN protocols p ON se.protocol_id = p.id
    JOIN experiment_types e ON p.experiment_type_id = e.id
    JOIN protocol_blocks pb ON sb.protocol_block_id = pb.id
    JOIN blocks b ON pb.block_id = b.id
    WHERE sb.scheduled_date = ? AND se.status != 'cancelled'
    ORDER BY se.start_date
  `).all(today) as any[];
  
  if (blocks.length === 0) return;
  
  // Build email HTML
  let html = `
    <div style="font-family: 'Helvetica Neue', sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
      <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h1 style="color: #6366F1; font-size: 20px; margin-bottom: 4px;">🧪 LabFlow</h1>
        <h2 style="color: #333; font-size: 18px; margin-bottom: 20px;">${dateLabel}の研究計画</h2>
  `;
  
  for (const block of blocks) {
    html += `
      <div style="border-left: 4px solid #6366F1; padding: 12px 16px; margin-bottom: 16px; background: #f0f0ff; border-radius: 0 8px 8px 0;">
        <div style="font-weight: 600; color: #333;">${block.experiment_type_name}${block.label ? ` - ${block.label}` : ''}</div>
        <div style="color: #666; font-size: 14px;">${block.block_name}</div>
        ${block.block_description ? `<div style="color: #888; font-size: 13px; margin-top: 4px;">${block.block_description}</div>` : ''}
      </div>
    `;
    
    // Load steps
    const steps = db.prepare(`
      SELECT s.name, s.duration_minutes
      FROM block_steps bs
      JOIN steps s ON bs.step_id = s.id
      WHERE bs.block_id = (SELECT block_id FROM protocol_blocks WHERE id = ?)
      ORDER BY bs.order_index
    `).all(block.protocol_block_id) as any[];
    
    if (steps.length > 0) {
      html += '<ul style="margin: 0 0 16px 20px; padding: 0; color: #555; font-size: 14px;">';
      for (const step of steps) {
        html += `<li style="margin-bottom: 4px;">${step.name} (${step.duration_minutes}分)</li>`;
      }
      html += '</ul>';
    }
  }
  
  html += `
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">Sent from LabFlow</p>
      </div>
    </div>
  `;
  
  sendEmail(`${dateLabel}の研究計画`, html);
}

// Reminder email for incomplete routines and depleted reagents (default: 19:00)
function sendReminderEmail() {
  const today = new Date().toISOString().split('T')[0];
  const dayOfWeek = new Date().getDay();
  
  // Check incomplete routines
  const routines = db.prepare(
    'SELECT * FROM routine_tasks WHERE is_active = 1'
  ).all() as any[];
  
  const incompleteRoutines = routines.filter(r => {
    let isToday = false;
    if (r.recurrence === 'daily') isToday = true;
    else if (r.recurrence === 'weekdays') isToday = dayOfWeek >= 1 && dayOfWeek <= 5;
    else {
      const days = JSON.parse(r.recurrence_days || '[]');
      isToday = days.includes(dayOfWeek);
    }
    if (!isToday) return false;
    
    const completion = db.prepare(
      'SELECT * FROM routine_completions WHERE routine_task_id = ? AND date = ?'
    ).get(r.id, today);
    return !completion;
  });
  
  // Check depleted reagents
  const depletedReagents = db.prepare(`
    SELECT * FROM reagents
    WHERE is_depleted = 1
    ORDER BY name
  `).all() as any[];
  
  if (incompleteRoutines.length === 0 && depletedReagents.length === 0) return;
  
  let html = `
    <div style="font-family: 'Helvetica Neue', sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
      <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h1 style="color: #F59E0B; font-size: 20px; margin-bottom: 16px;">⚠️ LabFlow リマインダー</h1>
  `;
  
  if (incompleteRoutines.length > 0) {
    html += `<h3 style="color: #333; margin-bottom: 12px;">未完了のルーティンワーク</h3><ul style="margin: 0 0 20px 20px; color: #555;">`;
    for (const r of incompleteRoutines) {
      html += `<li style="margin-bottom: 6px;">${r.name}</li>`;
    }
    html += '</ul>';
  }
  
  if (depletedReagents.length > 0) {
    html += `<h3 style="color: #333; margin-bottom: 12px;">枯渇している試薬・物品</h3><ul style="margin: 0 0 20px 20px; color: #555;">`;
    for (const r of depletedReagents) {
      html += `<li style="margin-bottom: 6px; color: #EF4444;">${r.name}${r.category ? ` (${r.category})` : ''}</li>`;
    }
    html += '</ul>';
  }
  
  html += `
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">Sent from LabFlow</p>
      </div>
    </div>
  `;
  
  sendEmail('LabFlow リマインダー', html);
}

export function startScheduler() {
  const settings = getSettings();
  const tz = settings.timezone || 'Asia/Tokyo';
  
  // Daily plan email at 0:00
  const dailyTime = settings.daily_email_time || '00:00';
  const [dH, dM] = dailyTime.split(':');
  cron.schedule(`${dM} ${dH} * * *`, () => {
    console.log('[Scheduler] Sending daily plan email...');
    sendDailyPlanEmail();
  }, { timezone: tz });
  
  // Reminder email at 19:00
  const reminderTime = settings.reminder_email_time || '19:00';
  const [rH, rM] = reminderTime.split(':');
  cron.schedule(`${rM} ${rH} * * *`, () => {
    console.log('[Scheduler] Sending reminder email...');
    sendReminderEmail();
  }, { timezone: tz });
  
  console.log(`[Scheduler] Daily plan email scheduled at ${dailyTime} (${tz})`);
  console.log(`[Scheduler] Reminder email scheduled at ${reminderTime} (${tz})`);
}
