import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Activity, AlertCircle, Clock, Microscope } from 'lucide-react';

const ImageProcessor = lazy(() => import('../components/analysis/ImageProcessor'));

type AnalysisTab = 'duration' | 'image';

export default function Analysis() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const isImageTab = location.pathname.includes('/image_analysis') || location.pathname.includes('/image');
  const activeTab: AnalysisTab = isImageTab ? 'image' : 'duration';

  const [protocols, setProtocols] = useState<any[]>([]);
  const [selectedProtocol, setSelectedProtocol] = useState<string>('');
  const [experiments, setExperiments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [visibleBlocks, setVisibleBlocks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.get('/analysis/protocols')
      .then(res => {
        setProtocols(res);
        if (res.length > 0) setSelectedProtocol(res[0].id.toString());
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedProtocol) return;
    setLoading(true);
    setVisibleBlocks({});
    api.get(`/analysis/duration/${selectedProtocol}`)
      .then(res => setExperiments(res))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedProtocol]);

  // Group by block
  const analysisData = useMemo(() => {
    if (!experiments.length) return null;
    
    const byBlock: Record<string, {
      name: string;
      blockKey: string;
      estimatedSteps: any[];
      experiments: any[];
    }> = {};

    experiments.forEach(exp => {
      exp.blocks?.forEach((block: any) => {
        const blockKey = block.block_name;
        if (!byBlock[blockKey]) {
          byBlock[blockKey] = { name: block.block_name, blockKey, estimatedSteps: [], experiments: [] };
        }
        
        const stepsData: any[] = [];
        let prevCompletedTime: Date | null = null;
        let totalActualMins = 0;
        let totalEstimatedMins = 0;

        block.steps?.forEach((step: any) => {
          let estimatedMins = step.duration_minutes;
          if (step.is_sample_dependent) {
            estimatedMins = step.duration_minutes * Math.ceil((exp.sample_count || 1) / (step.samples_per_batch || 1));
          }
          
          let actualMins = 0;
          if (step.status === 'completed' && step.completed_at) {
            const currentCompleted = new Date(step.completed_at);
            if (prevCompletedTime) {
              actualMins = Math.max(0, (currentCompleted.getTime() - prevCompletedTime.getTime()) / 60000);
            } else {
              const startDate = step.start_date || block.scheduled_date;
              if (startDate && step.start_time) {
                const startStr = `${startDate}T${step.start_time}:00`;
                const startObj = new Date(startStr);
                actualMins = Math.max(0, (currentCompleted.getTime() - startObj.getTime()) / 60000);
              } else {
                actualMins = estimatedMins; 
              }
            }
            prevCompletedTime = currentCompleted;
          }

          let displayActualMins = actualMins;
          let displayEstimatedMins = estimatedMins;
          
          if (step.is_sample_dependent && exp.sample_count) {
            const batches = Math.ceil(exp.sample_count / (step.samples_per_batch || 1));
            displayActualMins = actualMins / batches;
            displayEstimatedMins = step.duration_minutes;
          }

          stepsData.push({
            name: step.step_name,
            estimated: displayEstimatedMins,
            actual: displayActualMins,
            rawActual: actualMins,
            isSampleDependent: step.is_sample_dependent
          });
          
          totalActualMins += actualMins;
          totalEstimatedMins += estimatedMins;
        });

        if (byBlock[blockKey].estimatedSteps.length === 0 && stepsData.length > 0) {
          byBlock[blockKey].estimatedSteps = stepsData.map(s => ({
            name: s.name,
            estimated: s.estimated
          }));
        }

        if (stepsData.length > 0) {
          byBlock[blockKey].experiments.push({
            label: exp.label || '',
            date: exp.start_date,
            steps: stepsData,
            totalActual: totalActualMins,
            totalEstimated: totalEstimatedMins
          });
        }
      });
    });

    return byBlock;
  }, [experiments]);

  useEffect(() => {
    if (!analysisData) return;
    const initial: Record<string, boolean> = {};
    Object.values(analysisData).forEach(block => {
      if (!(block.blockKey in visibleBlocks)) {
        initial[block.blockKey] = true;
      }
    });
    if (Object.keys(initial).length > 0) {
      setVisibleBlocks(prev => ({ ...prev, ...initial }));
    }
  }, [analysisData]);

  const toggleBlock = (key: string) => {
    setVisibleBlocks(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const colors = ['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6', '#3B82F6', '#EF4444', '#14B8A6'];
  const CHART_HEIGHT = 200;
  const BAR_WIDTH = 36;
  const COL_WIDTH = 52;

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-xl)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-primary)', marginBottom: 'var(--space-xs)' }}>
            {t('analysis.title', '分析')}
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            {activeTab === 'duration'
              ? t('analysis.subtitle', '実験の所要時間の予実差や傾向を分析します。')
              : t('analysis.imageSubtitle', '画像上の対象を囲み、ラベリング・定量分析を行います。')}
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: 0,
        marginBottom: 'var(--space-xl)',
        borderBottom: '2px solid var(--border-default)'
      }}>
        <button
          onClick={() => navigate('/analysis/experiment_time')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-xs)',
            padding: 'var(--space-sm) var(--space-lg)',
            border: 'none',
            borderBottom: activeTab === 'duration' ? '2px solid var(--color-primary)' : '2px solid transparent',
            marginBottom: '-2px',
            background: 'none',
            color: activeTab === 'duration' ? 'var(--color-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'duration' ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
            fontSize: 'var(--font-size-sm)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <Clock size={16} />
          <span>{t('analysis.tabDuration', '実験時間分析')}</span>
        </button>
        <button
          onClick={() => navigate('/analysis/image_analysis')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-xs)',
            padding: 'var(--space-sm) var(--space-lg)',
            border: 'none',
            borderBottom: activeTab === 'image' ? '2px solid var(--color-primary)' : '2px solid transparent',
            marginBottom: '-2px',
            background: 'none',
            color: activeTab === 'image' ? 'var(--color-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'image' ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
            fontSize: 'var(--font-size-sm)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <Microscope size={16} />
          <span>{t('analysis.tabImage', '画像処理ツール')}</span>
        </button>
      </div>

      {/* Duration Analysis Tab */}
      {activeTab === 'duration' && (
        <>
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
            <div className="card-body">
              <label className="form-label">{t('analysis.selectProtocol', 'プロトコルを選択')}</label>
              <select 
                className="form-input" 
                style={{ maxWidth: 500 }}
                value={selectedProtocol}
                onChange={(e) => setSelectedProtocol(e.target.value)}
              >
                {protocols.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.experiment_type_name}({p.protocol_name})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading && <p>Loading...</p>}

          {!loading && analysisData && Object.keys(analysisData).length === 0 && (
            <div className="card" style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Activity size={48} style={{ margin: '0 auto var(--space-md)', opacity: 0.2 }} />
              <p>{t('analysis.noData', '完了した実験データがありません。')}</p>
            </div>
          )}

          {!loading && analysisData && Object.keys(analysisData).length > 0 && (
            <>
              {/* Block filter checkboxes */}
              <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
                <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginRight: 'var(--space-sm)' }}>
                    {t('analysis.showBlocks', '表示するブロック:')}
                  </span>
                  {Object.values(analysisData).map(block => (
                    <label key={block.blockKey} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-sm)', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={visibleBlocks[block.blockKey] !== false}
                        onChange={() => toggleBlock(block.blockKey)}
                      />
                      {block.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-2">
                {Object.values(analysisData)
                  .filter(block => visibleBlocks[block.blockKey] !== false)
                  .map(block => <BlockChart key={block.blockKey} block={block} colors={colors} chartHeight={CHART_HEIGHT} barWidth={BAR_WIDTH} colWidth={COL_WIDTH} t={t} />)}
              </div>
            </>
          )}
        </>
      )}

      {/* Image Processing Tab */}
      {activeTab === 'image' && (
        <Suspense fallback={<div className="card" style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>読み込み中...</div>}>
          <ImageProcessor />
        </Suspense>
      )}
    </div>
  );
}

// Separate component so we can use refs for SVG overlay
function BlockChart({ block, colors, chartHeight, barWidth, colWidth, t }: any) {
  const [svgLines, setSvgLines] = useState<string>('');

  const allBars = [
    { type: 'estimated', steps: block.estimatedSteps.map((s: any) => s.estimated) },
    ...block.experiments.map((exp: any) => ({ type: 'actual', steps: exp.steps.map((s: any) => s.actual) }))
  ];

  const estimatedTotal = block.estimatedSteps.reduce((sum: number, s: any) => sum + s.estimated, 0);
  const maxTotal = Math.max(
    estimatedTotal,
    ...block.experiments.map((e: any) => e.steps.reduce((sum: number, s: any) => sum + s.actual, 0))
  );
  const scale = maxTotal > 0 ? Math.min(1, chartHeight / maxTotal) : 1;
  const totalWidth = allBars.length * colWidth;

  useEffect(() => {
    if (allBars.length < 2) { setSvgLines(''); return; }
    const barBoundaries: number[][] = allBars.map(bar => {
      const boundaries: number[] = [];
      let cum = 0;
      for (const val of bar.steps) { cum += val * scale; boundaries.push(cum); }
      return boundaries;
    });
    let pathD = '';
    for (let i = 0; i < barBoundaries.length - 1; i++) {
      const leftBounds = barBoundaries[i];
      const rightBounds = barBoundaries[i + 1];
      const leftX = i * colWidth + (colWidth + barWidth) / 2;
      const rightX = (i + 1) * colWidth + (colWidth - barWidth) / 2;
      const minLen = Math.min(leftBounds.length, rightBounds.length);
      for (let s = 0; s < minLen; s++) {
        const y1 = chartHeight - leftBounds[s];
        const y2 = chartHeight - rightBounds[s];
        pathD += `M${leftX},${y1} L${rightX},${y2} `;
      }
    }
    setSvgLines(pathD);
  }, [block, scale]);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">{block.name}</h3>
      </div>
      <div className="card-body">
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>
          {t('analysis.chartDescription', '※サンプル数依存のステップは「1バッチあたり」の時間に正規化して表示しています。')}
        </div>
        
        <div style={{ overflowX: 'auto', paddingBottom: 'var(--space-sm)' }}>
          <div style={{ width: totalWidth, minWidth: 'max-content' }}>
            {/* ===== BAR AREA (top) ===== */}
            <div style={{ position: 'relative', height: chartHeight }}>
              <svg style={{ position: 'absolute', top: 0, left: 0, width: totalWidth, height: chartHeight, pointerEvents: 'none', zIndex: 3 }}>
                <path d={svgLines} fill="none" stroke="rgba(120,120,120,0.45)" strokeWidth="1" strokeDasharray="4,3" />
              </svg>
              <div style={{ display: 'flex', height: chartHeight, alignItems: 'flex-end' }}>
                {/* Estimated bar */}
                <div style={{ width: colWidth, display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: barWidth, display: 'flex', flexDirection: 'column-reverse', borderRadius: 3, overflow: 'hidden', border: '2px dashed var(--border-default)', position: 'relative', zIndex: 2 }}>
                    {block.estimatedSteps.map((step: any, sIdx: number) => (
                      <div 
                        key={sIdx} 
                        title={`${step.name}: ${Math.round(step.estimated)} min (${t('analysis.estimated', '見込み')})`}
                        style={{ 
                          height: `${Math.max(1, step.estimated * scale)}px`, 
                          backgroundColor: colors[sIdx % colors.length],
                          opacity: 0.5,
                          borderTop: sIdx > 0 ? '1px solid rgba(255,255,255,0.3)' : 'none'
                        }} 
                      />
                    ))}
                  </div>
                </div>
                {/* Actual bars */}
                {block.experiments.map((_exp: any, expIdx: number) => (
                  <div key={expIdx} style={{ width: colWidth, display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: barWidth, display: 'flex', flexDirection: 'column-reverse', borderRadius: 3, overflow: 'hidden', position: 'relative', zIndex: 2 }}>
                      {_exp.steps.map((step: any, sIdx: number) => (
                        <div 
                          key={sIdx} 
                          title={`${step.name}: ${Math.round(step.actual)} min (${t('analysis.actual', '実績')})`}
                          style={{ 
                            height: `${Math.max(1, step.actual * scale)}px`, 
                            backgroundColor: colors[sIdx % colors.length],
                            borderTop: sIdx > 0 ? '1px solid rgba(255,255,255,0.2)' : 'none'
                          }} 
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ===== LABEL AREA (bottom) ===== */}
            <div style={{ display: 'flex', borderTop: '1px solid var(--border-default)', paddingTop: 6 }}>
              {/* Estimated label */}
              <div style={{ width: colWidth, textAlign: 'center' }}>
                <div style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                  {t('analysis.estimated', '見込み')}
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>
                  {Math.round(estimatedTotal)}{t('analysis.min', '分')}
                </div>
              </div>
              {/* Actual labels */}
              {block.experiments.map((exp: any, expIdx: number) => {
                const actualTotal = exp.steps.reduce((sum: number, s: any) => sum + s.actual, 0);
                return (
                  <div key={expIdx} style={{ width: colWidth, textAlign: 'center', overflow: 'hidden' }}>
                    <div style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={exp.label || exp.date}>
                      {exp.label || `#${expIdx + 1}`}
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>
                      {exp.date}
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>
                      {Math.round(actualTotal)}{t('analysis.min', '分')}
                    </div>
                    {exp.totalActual > exp.totalEstimated * 1.5 && (
                      <div style={{ color: 'var(--color-danger)', marginTop: 1 }} title={t('analysis.overtime', '見込み時間を大きく超過しています')}>
                        <AlertCircle size={12} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', marginTop: 'var(--space-md)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--border-default)' }}>
          {block.estimatedSteps.map((step: any, sIdx: number) => (
            <div key={sIdx} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)' }}>
              <div style={{ width: 10, height: 10, backgroundColor: colors[sIdx % colors.length], borderRadius: 2 }} />
              <span>{step.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
