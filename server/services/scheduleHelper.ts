import Database from 'better-sqlite3';

export function recalculateBlockSchedule(
  db: Database.Database,
  userId: number,
  blockId: number,
  dateStr: string,
  warningsArray: string[]
): void {
  // Get timed events for the day
  const dayEvents = db.prepare('SELECT start_time, end_time FROM events WHERE user_id = ? AND date = ?').all(userId, dateStr) as any[];
  const timedEvents = dayEvents.filter(e => e.start_time && e.end_time).map(e => {
    const [sh, sm] = e.start_time.split(':').map(Number);
    const [eh, em] = e.end_time.split(':').map(Number);
    return { start: sh * 60 + sm, end: eh * 60 + em };
  }).sort((a, b) => a.start - b.start);

  // Get steps for the scheduled block
  const steps = db.prepare(`
    SELECT ss.id, ss.start_time, ss.end_time, ss.status, bs.order_index,
           s.name as step_name, s.duration_minutes, s.is_overnight
    FROM scheduled_steps ss
    JOIN block_steps bs ON ss.block_step_id = bs.id
    JOIN steps s ON bs.step_id = s.id
    WHERE ss.scheduled_block_id = ?
    ORDER BY bs.order_index
  `).all(blockId) as any[];

  if (steps.length === 0) return;

  const updateStep = db.prepare('UPDATE scheduled_steps SET start_time = ?, end_time = ?, start_date = ?, end_date = ? WHERE id = ?');
  
  // Find the first start time (either from a completed step or the very first step)
  let currentStartTime = steps[0].start_time || '09:00';
  let cumulativeDays = 0;
  
  for (const step of steps) {
    if (step.status === 'completed') {
      currentStartTime = step.end_time || currentStartTime;
      // Note: We don't accurately track past days for completed steps yet if they were modified,
      // but assuming they completed on time, we could increment cumulativeDays if they crossed midnight.
      // For now, we leave cumulativeDays alone, which assumes they didn't cross boundaries unexpectedly,
      // or we can rely on `is_overnight` or duration to estimate.
      if (step.is_overnight === 1) cumulativeDays += 1;
      else cumulativeDays += Math.floor(step.duration_minutes / 1440);
      continue;
    }

    const [ch, cm] = currentStartTime.split(':').map(Number);
    let sStartMins = ch * 60 + cm;
    let stepDuration = step.is_overnight === 1 ? (24 * 60 - sStartMins - 1) : step.duration_minutes; // If overnight, finishes at 23:59 of CURRENT relative day
    
    // We adjust overnight duration to roughly reach 09:00 next day if it's overnight. Actually, is_overnight means it just crosses over.
    let sEndMins = sStartMins + stepDuration;

    let hasOverlap = true;
    while (hasOverlap) {
      hasOverlap = false;
      for (const e of timedEvents) {
        if (sStartMins < e.end && sEndMins > e.start) {
          sStartMins = e.end;
          sEndMins = sStartMins + stepDuration;
          hasOverlap = true;
          break;
        }
      }
    }

    // Accumulate days from start if it got pushed past midnight
    let sStartH = Math.floor(sStartMins / 60);
    if (sStartH >= 24) {
      cumulativeDays += Math.floor(sStartH / 24);
      sStartH = sStartH % 24;
      sStartMins = sStartH * 60 + (sStartMins % 60);
      sEndMins = sStartMins + stepDuration;
    }
    const sStartM = sStartMins % 60;
    const sStart = `${String(sStartH).padStart(2, '0')}:${String(sStartM).padStart(2, '0')}`;

    // Fix timezone issues by creating date properly
    const formatDate = (dateObj: Date) => {
      return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    };

    const stepStartDateObj = new Date(dateStr + 'T00:00:00');
    stepStartDateObj.setDate(stepStartDateObj.getDate() + cumulativeDays);
    const stepStartDateStr = formatDate(stepStartDateObj);

    let sEnd = '23:59';
    if (step.is_overnight === 1) {
      cumulativeDays += 1;
      sEnd = '09:00';
    } else {
      let sEndH = Math.floor(sEndMins / 60);
      const sEndM = sEndMins % 60;
      if (sEndH >= 24) {
        cumulativeDays += Math.floor(sEndH / 24);
      }
      sEnd = `${String(sEndH % 24).padStart(2, '0')}:${String(sEndM).padStart(2, '0')}`;
    }

    const stepEndDateObj = new Date(dateStr + 'T00:00:00');
    stepEndDateObj.setDate(stepEndDateObj.getDate() + cumulativeDays);
    const stepEndDateStr = formatDate(stepEndDateObj);

    updateStep.run(sStart, sEnd, stepStartDateStr, stepEndDateStr, step.id);
    currentStartTime = sEnd;
  }
  
  const formatDate = (dateObj: Date) => {
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
  };

  const blockDateObj = new Date(dateStr + 'T00:00:00');
  blockDateObj.setDate(blockDateObj.getDate() + cumulativeDays);
  const end_date = formatDate(blockDateObj);

  // Update block end_time based on the last step
  const lastStepEnd = currentStartTime;
  db.prepare('UPDATE scheduled_blocks SET end_time = ?, end_date = ? WHERE id = ?').run(lastStepEnd, end_date, blockId);
}
