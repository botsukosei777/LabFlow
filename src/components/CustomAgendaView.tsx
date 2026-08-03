import React, { useMemo } from 'react';
import { format, addDays, startOfDay, endOfDay } from 'date-fns';

const CustomAgendaViewInner = ({ events, date, length = 30, accessors, localizer, onSelectEvent }: any) => {
  const endDate = addDays(date, length);

  const agendaEvents = useMemo(() => {
    const filtered = events.filter((e: any) => {
      const start = e.start;
      return start >= startOfDay(date) && start <= endOfDay(endDate);
    });

    filtered.sort((a: any, b: any) => a.start.getTime() - b.start.getTime());

    // Group by date
    const byDay: { [key: string]: any[] } = {};
    filtered.forEach((e: any) => {
      const day = format(e.start, 'yyyy-MM-dd');
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(e);
    });

    // Sub-group by overlap
    const groupedByDayAndOverlap: { date: Date, rows: any[][] }[] = [];
    
    Object.keys(byDay).sort().forEach(dayStr => {
      const dayEvents = byDay[dayStr];
      const rows: any[][] = [];
      
      dayEvents.forEach(e => {
        const start = e.start.getTime();
        const end = e.end.getTime();
        
        let placed = false;
        if (rows.length > 0) {
          const lastRow = rows[rows.length - 1];
          const overlaps = lastRow.some(re => {
            const reStart = re.start.getTime();
            const reEnd = re.end.getTime();
            return (start < reEnd && end > reStart);
          });
          
          if (overlaps) {
            lastRow.push(e);
            placed = true;
          }
        }
        
        if (!placed) {
          rows.push([e]);
        }
      });
      
      groupedByDayAndOverlap.push({
        date: new Date(dayStr + 'T00:00:00'),
        rows
      });
    });

    return groupedByDayAndOverlap;
  }, [events, date, endDate]);

  if (agendaEvents.length === 0) {
    return (
      <div className="rbc-agenda-view">
        <span className="rbc-agenda-empty">表示するイベントがありません。</span>
      </div>
    );
  }

  return (
    <div className="rbc-agenda-view" style={{ overflowY: 'auto' }}>
      <table className="rbc-agenda-table">
        <thead>
          <tr>
            <th className="rbc-header">日付</th>
            <th className="rbc-header">時間</th>
            <th className="rbc-header">イベント</th>
          </tr>
        </thead>
        <tbody className="rbc-agenda-tbody">
          {agendaEvents.map((dayGroup, i) => (
            <React.Fragment key={i}>
              {dayGroup.rows.map((row, j) => (
                <tr key={`${i}-${j}`}>
                  {j === 0 && (
                    <td className="rbc-agenda-date-cell" rowSpan={dayGroup.rows.length} style={{ verticalAlign: 'top', padding: '8px' }}>
                      <strong>{format(dayGroup.date, 'MM/dd (E)')}</strong>
                    </td>
                  )}
                  <td className="rbc-agenda-time-cell" style={{ whiteSpace: 'nowrap', padding: '8px', verticalAlign: 'middle' }}>
                    {row[0].allDay ? '終日' : (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span>{format(row[0].start, 'HH:mm')}</span>
                        <span style={{ fontSize: '0.8em', color: 'var(--text-secondary)' }}>
                          - {Math.max(...row.map(r => r.end.getTime())) !== row[0].start.getTime() ? format(new Date(Math.max(...row.map(r => r.end.getTime()))), 'HH:mm') : ''}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="rbc-agenda-event-cell" style={{ padding: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {row.map((event: any) => (
                        <div 
                          key={event.id}
                          onClick={(e) => {
                             e.preventDefault();
                             if (onSelectEvent) onSelectEvent(event, e);
                          }}
                          style={{ 
                            backgroundColor: event.color || 'var(--color-primary)', 
                            color: 'white', 
                            padding: '4px 8px', 
                            borderRadius: '4px',
                            cursor: 'pointer',
                            flex: 1,
                            minWidth: 'fit-content',
                            opacity: event.type === 'block' || event.type === 'step' ? 0.8 : 1,
                            fontSize: '0.9em'
                          }}
                        >
                          {event.title}
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

class ErrorBoundary extends React.Component<any, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return <div style={{color: 'red', padding: 20}}>Agenda Error: {this.state.error?.message || String(this.state.error)}</div>;
    }
    return this.props.children;
  }
}

const CustomAgendaView = (props: any) => (
  <ErrorBoundary>
    <CustomAgendaViewInner {...props} />
  </ErrorBoundary>
);

CustomAgendaView.title = (start: Date, { length = 30 }: any) => {
  const end = addDays(start, length);
  return `${format(start, 'yyyy/MM/dd')} — ${format(end, 'yyyy/MM/dd')}`;
};

CustomAgendaView.navigate = (date: Date, action: string, { length = 30 }: any) => {
  switch (action) {
    case 'PREV':
      return addDays(date, -length);
    case 'NEXT':
      return addDays(date, length);
    default:
      return date;
  }
};

export default CustomAgendaView;
