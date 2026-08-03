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
    SELECT ss.id, ss.start_time, ss.end_time, ss.status, bs.order_index, bs.branch_index, bs.delay_minutes,
           s.name as step_name, s.duration_minutes, s.is_overnight
    FROM scheduled_steps ss
    JOIN block_steps bs ON ss.block_step_id = bs.id
    JOIN steps s ON bs.step_id = s.id
    WHERE ss.scheduled_block_id = ?
    ORDER BY bs.order_index
  `).all(blockId) as any[];

  if (steps.length === 0) return;

  const updateStep = db.prepare('UPDATE scheduled_steps SET start_time = ?, end_time = ?, start_date = ?, end_date = ? WHERE id = ?');
  
  const stages: any[][][] = [];
  steps.forEach(step => {
    while (stages.length <= step.order_index) stages.push([]);
    const stage = stages[step.order_index];
    const bIndex = step.branch_index || 0;
    while (stage.length <= bIndex) stage.push([]);
    stage[bIndex].push(step);
  });

  // Find the first start time (either from a completed step or the very first step)
  let stageBaseStartTime = steps[0].start_time || '09:00';
  let cumulativeDays = 0;

  const formatDate = (dateObj: Date) => {
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
  };

  for (const stage of stages) {
    if (!stage || stage.length === 0) continue;

    let maxStageEndMins = 0;
    let maxStageCumulativeDays = cumulativeDays;
    const [ch, cm] = stageBaseStartTime.split(':').map(Number);
    const stageBaseMins = ch * 60 + cm;

    for (const branch of stage) {
      if (!branch || branch.length === 0) continue;
      
      let branchCurrentMins = stageBaseMins;
      let branchCumulativeDays = cumulativeDays;

      for (const step of branch) {
        if (step.status === 'completed') {
          const [eh, em] = (step.end_time || '00:00').split(':').map(Number);
          const endMins = eh * 60 + em;
          let cDays = branchCumulativeDays;
          if (step.is_overnight === 1) cDays += 1;
          else cDays += Math.floor(step.duration_minutes / 1440);
          
          branchCurrentMins = endMins;
          branchCumulativeDays = cDays;
          
          if (cDays > maxStageCumulativeDays || (cDays === maxStageCumulativeDays && endMins > maxStageEndMins)) {
            maxStageCumulativeDays = cDays;
            maxStageEndMins = endMins;
          }
          continue;
        }

        // delay_minutes is the ABSOLUTE offset from the start of the stage
        let sStartMins = stageBaseMins + (step.delay_minutes || 0);
        let sCumulativeDays = cumulativeDays;

        // Handle overflow from delay
        if (sStartMins >= 1440) {
          sCumulativeDays += Math.floor(sStartMins / 1440);
          sStartMins = sStartMins % 1440;
        }

        let stepDuration = step.is_overnight === 1 ? (24 * 60 - sStartMins - 1) : step.duration_minutes;
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

        let sStartH = Math.floor(sStartMins / 60);
        if (sStartH >= 24) {
          sCumulativeDays += Math.floor(sStartH / 24);
          sStartH = sStartH % 24;
          sStartMins = sStartH * 60 + (sStartMins % 60);
          sEndMins = sStartMins + stepDuration;
        }
        const sStartM = sStartMins % 60;
        const sStart = `${String(sStartH).padStart(2, '0')}:${String(sStartM).padStart(2, '0')}`;

        const stepStartDateObj = new Date(dateStr + 'T00:00:00');
        stepStartDateObj.setDate(stepStartDateObj.getDate() + sCumulativeDays);
        const stepStartDateStr = formatDate(stepStartDateObj);

        let sEnd = '23:59';
        let sEndCumulativeDays = sCumulativeDays;
        if (step.is_overnight === 1) {
          sEndCumulativeDays += 1;
          sEnd = '09:00';
          // End mins doesn't matter for next step in branch since overnight is usually end of branch
        } else {
          let sEndH = Math.floor(sEndMins / 60);
          const sEndM = sEndMins % 60;
          if (sEndH >= 24) {
            sEndCumulativeDays += Math.floor(sEndH / 24);
          }
          sEnd = `${String(sEndH % 24).padStart(2, '0')}:${String(sEndM).padStart(2, '0')}`;
        }

        const stepEndDateObj = new Date(dateStr + 'T00:00:00');
        stepEndDateObj.setDate(stepEndDateObj.getDate() + sEndCumulativeDays);
        const stepEndDateStr = formatDate(stepEndDateObj);

        updateStep.run(sStart, sEnd, stepStartDateStr, stepEndDateStr, step.id);

        // Track max end time to advance stageBaseStartTime (for the NEXT stage)
        const [finalEh, finalEm] = sEnd.split(':').map(Number);
        const endMinsAbsolute = finalEh * 60 + finalEm;
        if (sEndCumulativeDays > maxStageCumulativeDays || (sEndCumulativeDays === maxStageCumulativeDays && endMinsAbsolute > maxStageEndMins)) {
          maxStageCumulativeDays = sEndCumulativeDays;
          maxStageEndMins = endMinsAbsolute;
        }
      }
    }

    // Advance to next stage
    cumulativeDays = maxStageCumulativeDays;
    stageBaseStartTime = `${String(Math.floor(maxStageEndMins / 60)).padStart(2, '0')}:${String(maxStageEndMins % 60).padStart(2, '0')}`;
  }

  const blockDateObj = new Date(dateStr + 'T00:00:00');
  blockDateObj.setDate(blockDateObj.getDate() + cumulativeDays);
  const end_date = formatDate(blockDateObj);

  // Update block end_time based on the last stage
  const lastStepEnd = stageBaseStartTime;
  db.prepare('UPDATE scheduled_blocks SET end_time = ?, end_date = ? WHERE id = ?').run(lastStepEnd, end_date, blockId);
}
