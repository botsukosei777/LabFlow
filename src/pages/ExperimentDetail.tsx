import { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, Trash2, Edit, Clock, GripVertical, Check, FileText, ArrowUp, ArrowDown, Copy } from 'lucide-react';
import { api } from '../api/client';
import { ToastContext } from '../App';
import type { ExperimentType, Step, Block, Protocol, SubProtocol } from '../types';
import MDEditor from '@uiw/react-md-editor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ExperimentDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useContext(ToastContext);
  const [experiment, setExperiment] = useState<ExperimentType | null>(null);
  const [activeTab, setActiveTab] = useState<'steps' | 'blocks' | 'protocols' | 'sub_protocols'>('steps');
  const [steps, setSteps] = useState<Step[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [protocols, setProtocols] = useState<any[]>([]);
  const [subProtocols, setSubProtocols] = useState<SubProtocol[]>([]);
  const [loading, setLoading] = useState(true);

  // Step form
  const [showStepModal, setShowStepModal] = useState(false);
  const [editingStep, setEditingStep] = useState<Step | null>(null);
  const [stepForm, setStepForm] = useState({ name: '', description: '', duration_minutes: 0, is_sample_dependent: false, samples_per_batch: 1, is_overnight: false, pattern_label: 'default', sub_protocol_id: null as number | null, preparations: [] as any[], routine_name: '', routine_duration_days: 0, routine_recurrence: 'daily' as any });

  // ... (some lines omitted, use replace_file_content smartly)
  
  // Actually, I'll do this in multiple steps. I'll just use a sed-like approach or run a node script to replace all setStepForm({ name: ... }) with the added field.

  // Block form
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [editingBlock, setEditingBlock] = useState<any>(null);
  const [blockForm, setBlockForm] = useState({ name: '', description: '', pattern_label: 'default', step_nodes: [] as { step_id: number, delay_minutes: number }[][][] });

  // Import Step form
  const [showImportModal, setShowImportModal] = useState(false);
  const [allExperiments, setAllExperiments] = useState<any[]>([]);
  const [importSelectedExpId, setImportSelectedExpId] = useState<number | null>(null);
  const [importSteps, setImportSteps] = useState<any[]>([]);
  const [importSelectedStepId, setImportSelectedStepId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);

  // Protocol form
  const [showProtocolModal, setShowProtocolModal] = useState(false);
  const [editingProtocol, setEditingProtocol] = useState<any>(null);
  const [protocolForm, setProtocolForm] = useState({ name: '', description: '', color: '', blocks: [] as { block_id: number; day_offset: number }[] });



  // Pattern filter
  const [selectedPattern, setSelectedPattern] = useState<string>('all');

  const fetchData = async () => {
    if (!id) return;
    try {
      const [exp, stepsData, blocksData, protocolsData, subProtocolsData] = await Promise.all([
        api.get<ExperimentType>(`/experiments/${id}`),
        api.get<Step[]>(`/experiments/${id}/steps`),
        api.get<any[]>(`/experiments/${id}/blocks`),
        api.get<any[]>(`/experiments/${id}/protocols`),
        api.get<SubProtocol[]>(`/sub_protocols`),
      ]);
      setExperiment(exp);
      setSteps(stepsData);
      setBlocks(blocksData);
      setProtocols(protocolsData);
      setSubProtocols(subProtocolsData);
    } catch (error) {
      addToast('error', t('common.errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  // Get unique pattern labels
  const stepPatterns = [...new Set(steps.map(s => s.pattern_label))];
  const blockPatterns = [...new Set(blocks.map(b => b.pattern_label))];
  const currentPatterns = activeTab === 'steps' ? stepPatterns : activeTab === 'blocks' ? blockPatterns : [];

  // Filtered items
  const filteredSteps = selectedPattern === 'all' ? steps : steps.filter(s => s.pattern_label === selectedPattern);
  const filteredBlocks = selectedPattern === 'all' ? blocks : blocks.filter(b => b.pattern_label === selectedPattern);

  // Step CRUD
  const handleStepSubmit = async () => {
    if (!stepForm.name.trim()) return;
    try {
      if (editingStep) {
        await api.put(`/experiments/steps/${editingStep.id}`, { ...stepForm, order_index: editingStep.order_index });
      } else {
        await api.post(`/experiments/${id}/steps`, stepForm);
      }
      addToast('success', t('common.savedSuccessfully'));
      setShowStepModal(false);
      setEditingStep(null);
      setStepForm({ name: '', description: '', duration_minutes: 0, is_sample_dependent: false, samples_per_batch: 1, is_overnight: false, pattern_label: 'default', sub_protocol_id: null, preparations: [], routine_name: '', routine_duration_days: 0, routine_recurrence: 'daily' });
      fetchData();
    } catch (error) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const deleteStep = async (stepId: number) => {
    try {
      await api.delete(`/experiments/steps/${stepId}`);
      addToast('success', t('common.deletedSuccessfully'));
      fetchData();
    } catch (error) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const openImportModal = async () => {
    try {
      const exps = await api.get<any[]>('/experiments');
      setAllExperiments(exps.filter(e => e.id !== parseInt(id!))); // Exclude current
      setShowImportModal(true);
      setImportSelectedExpId(null);
      setImportSelectedStepId(null);
      setImportSteps([]);
    } catch (e) {
      addToast('error', 'Failed to load experiments');
    }
  };

  const loadImportSteps = async (expId: number) => {
    setImportSelectedExpId(expId);
    setImportSelectedStepId(null);
    try {
      const st = await api.get<any[]>(`/experiments/${expId}/steps`);
      setImportSteps(st);
    } catch (e) {
      addToast('error', 'Failed to load steps');
    }
  };

  const handleImportSubmit = async () => {
    if (!importSelectedStepId) return;
    setImporting(true);
    try {
      await api.post(`/experiments/${id}/steps/import`, { source_step_id: importSelectedStepId });
      addToast('success', 'ステップをインポートしました');
      setShowImportModal(false);
      fetchData();
    } catch (e: any) {
      addToast('error', e.message || 'インポートに失敗しました');
    } finally {
      setImporting(false);
    }
  };

  // Block CRUD
  const handleBlockSubmit = async () => {
    if (!blockForm.name.trim()) return;
    try {
      if (editingBlock) {
        await api.put(`/experiments/blocks/${editingBlock.id}`, { ...blockForm, order_index: editingBlock.order_index });
      } else {
        await api.post(`/experiments/${id}/blocks`, blockForm);
      }
      addToast('success', t('common.savedSuccessfully'));
      setShowBlockModal(false);
      setEditingBlock(null);
      setBlockForm({ name: '', description: '', pattern_label: 'default', step_nodes: [] });
      fetchData();
    } catch (error: any) {
      addToast('error', error.message || t('common.errorOccurred'));
    }
  };

  const deleteBlock = async (blockId: number) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    try {
      await api.delete(`/experiments/blocks/${blockId}`);
      addToast('success', t('common.deletedSuccessfully'));
      fetchData();
    } catch (error) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  // Protocol CRUD
  const handleProtocolSubmit = async () => {
    if (!protocolForm.name.trim()) return;
    try {
      if (editingProtocol) {
        await api.put(`/experiments/protocols/${editingProtocol.id}`, protocolForm);
      } else {
        await api.post(`/experiments/${id}/protocols`, protocolForm);
      }
      addToast('success', t('common.savedSuccessfully'));
      setShowProtocolModal(false);
      setEditingProtocol(null);
      setProtocolForm({ name: '', description: '', blocks: [] });
      fetchData();
    } catch (error) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const deleteProtocol = async (protocolId: number) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    try {
      await api.delete(`/experiments/protocols/${protocolId}`);
      addToast('success', t('common.deletedSuccessfully'));
      fetchData();
    } catch (error) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const copyBlock = async (blockId: number) => {
    try {
      await api.post(`/experiments/blocks/${blockId}/copy`);
      addToast('success', t('common.savedSuccessfully'));
      fetchData();
    } catch (error) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const copyProtocol = async (protocolId: number) => {
    try {
      await api.post(`/experiments/protocols/${protocolId}/copy`);
      addToast('success', t('common.savedSuccessfully'));
      fetchData();
    } catch (error) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const handleSubProtocolSubmit = async () => {
    if (!subProtocolForm.name.trim()) return;
    try {
      if (editingSubProtocol) {
        await api.put(`/experiments/sub_protocols/${editingSubProtocol.id}`, subProtocolForm);
      } else {
        await api.post(`/experiments/${id}/sub_protocols`, subProtocolForm);
      }
      addToast('success', t('common.savedSuccessfully'));
      setShowSubProtocolModal(false);
      setEditingSubProtocol(null);
      setSubProtocolForm({ name: '', content: '' });
      fetchData();
    } catch (error) {
      addToast('error', t('common.errorOccurred'));
    }
  };

  const deleteSubProtocol = async (subId: number) => {
    if (window.confirm(t('common.confirmDelete', '本当に削除しますか？'))) {
      try {
        await api.delete(`/experiments/sub_protocols/${subId}`);
        addToast('success', t('common.deletedSuccessfully'));
        fetchData();
      } catch (error) {
        addToast('error', t('common.errorOccurred'));
      }
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}${t('common.minutes')}`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}${t('common.hours')}${m}${t('common.minutes')}` : `${h}${t('common.hours')}`;
  };

  if (loading) return <div className="animate-pulse" style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>{t('common.loading')}</div>;
  if (!experiment) return <div>Not found</div>;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <button className="btn btn-ghost btn-icon" onClick={() => navigate('/experiments')}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <div className="color-dot" style={{ backgroundColor: experiment.color, width: 14, height: 14 }} />
              <h1 className="page-title">{experiment.name}</h1>
            </div>
            {experiment.description && <p className="page-description">{experiment.description}</p>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${activeTab === 'steps' ? 'active' : ''}`} onClick={() => { setActiveTab('steps'); setSelectedPattern('all'); }}>
          {t('experiments.steps')} ({steps.length})
        </button>
        <button className={`tab ${activeTab === 'blocks' ? 'active' : ''}`} onClick={() => { setActiveTab('blocks'); setSelectedPattern('all'); }}>
          {t('experiments.blocks')} ({blocks.length})
        </button>
        <button className={`tab ${activeTab === 'protocols' ? 'active' : ''}`} onClick={() => { setActiveTab('protocols'); setSelectedPattern('all'); }}>
          {t('experiments.protocols')} ({protocols.length})
        </button>
      </div>

      {/* Pattern Filter */}
      {currentPatterns.length > 1 && (
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
          <button className={`tag ${selectedPattern === 'all' ? 'active' : ''}`} onClick={() => setSelectedPattern('all')}>
            {t('common.all')}
          </button>
          {currentPatterns.map(p => (
            <button key={p} className={`tag ${selectedPattern === p ? 'active' : ''}`} onClick={() => setSelectedPattern(p)}>
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Steps Tab */}
      {activeTab === 'steps' && (
        <div>
          <div style={{ marginBottom: 'var(--space-md)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
            <button className="btn btn-secondary btn-sm" onClick={openImportModal}>
              <Edit size={14} /> インポート
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => {
              setEditingStep(null);
              setStepForm({ name: '', description: '', duration_minutes: 0, is_sample_dependent: false, samples_per_batch: 1, is_overnight: false, pattern_label: selectedPattern !== 'all' ? selectedPattern : 'default', sub_protocol_id: null, preparations: [], routine_name: '', routine_duration_days: 0, routine_recurrence: 'daily' });
              setShowStepModal(true);
            }}>
              <Plus size={14} /> {t('experiments.addStep')}
            </button>
          </div>
          {filteredSteps.length === 0 ? (
            <div className="empty-state"><p>{t('experiments.noSteps')}</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {filteredSteps.map(step => (
                <div key={step.id} className="card" style={{ padding: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 2 }}>
                      <span style={{ fontWeight: 'var(--font-weight-medium)' }}>{step.name}</span>
                      {step.pattern_label !== 'default' && <span className="badge badge-primary">{step.pattern_label}</span>}
                    </div>
                    {step.description && <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{step.description}</p>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                    <span className="badge badge-info"><Clock size={12} /> {step.is_overnight ? 'Overnight' : formatDuration(step.duration_minutes)}</span>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => {
                      setEditingStep(step);
                      setStepForm({ name: step.name, description: step.description || '', duration_minutes: step.duration_minutes, is_sample_dependent: !!step.is_sample_dependent, samples_per_batch: step.samples_per_batch || 1, is_overnight: !!step.is_overnight, pattern_label: step.pattern_label, sub_protocol_id: step.sub_protocol_id || null, preparations: step.preparations || [], routine_name: step.routine_name || '', routine_duration_days: step.routine_duration_days || 0, routine_recurrence: step.routine_recurrence || 'daily' });
                      setShowStepModal(true);
                    }}><Edit size={14} /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => deleteStep(step.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Blocks Tab */}
      {activeTab === 'blocks' && (
        <div>
          <div style={{ marginBottom: 'var(--space-md)', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary btn-sm" onClick={() => {
              setEditingBlock(null);
              setBlockForm({ name: '', description: '', pattern_label: selectedPattern !== 'all' ? selectedPattern : 'default', step_nodes: [] });
              setShowBlockModal(true);
            }}>
              <Plus size={14} /> {t('experiments.addBlock')}
            </button>
          </div>
          {filteredBlocks.length === 0 ? (
            <div className="empty-state"><p>{t('experiments.noBlocks')}</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {filteredBlocks.map(block => (
                <div key={block.id} className="card">
                  <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                      <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>{block.name}</span>
                      {block.pattern_label !== 'default' && <span className="badge badge-primary">{block.pattern_label}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => {
                        setEditingBlock(block);
                        const grouped: {step_id: number, delay_minutes: number}[][][] = [];
                        block.steps?.forEach((bs: any) => {
                          while(grouped.length <= bs.order_index) grouped.push([]);
                          while(grouped[bs.order_index].length <= (bs.branch_index || 0)) grouped[bs.order_index].push([]);
                          grouped[bs.order_index][bs.branch_index || 0].push({ step_id: bs.step_id, delay_minutes: bs.delay_minutes || 0 });
                        });
                        setBlockForm({
                          name: block.name, description: block.description || '', pattern_label: block.pattern_label,
                          step_nodes: grouped
                        });
                        setShowBlockModal(true);
                      }}><Edit size={14} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => copyBlock(block.id)}><Copy size={14} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => deleteBlock(block.id)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {block.description && <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>{block.description}</p>}
                  {block.steps && block.steps.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 'var(--space-md)', borderLeft: '2px solid var(--border-default)' }}>
                      {(() => {
                        const stages: any[][][] = [];
                        block.steps.forEach((bs: any) => {
                          while(stages.length <= bs.order_index) stages.push([]);
                          while(stages[bs.order_index].length <= (bs.branch_index || 0)) stages[bs.order_index].push([]);
                          stages[bs.order_index][bs.branch_index || 0].push(bs);
                        });
                        return stages.map((stage, i) => (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', padding: '4px 0', borderBottom: i < stages.length - 1 ? '1px dashed var(--border-default)' : 'none' }}>
                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginBottom: 2 }}>Stage {i + 1}</div>
                            <div style={{ display: 'flex', gap: 'var(--space-md)', overflowX: 'auto', paddingBottom: 4 }}>
                              {stage.map((branch, j) => (
                                <div key={j} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
                                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Branch {j + 1}</div>
                                  {branch.map((bs: any) => (
                                    <div key={bs.id} className="badge" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                      <span>{bs.step_name}</span>
                                      {bs.delay_minutes > 0 && <span style={{ fontSize: '10px', color: 'var(--color-warning)' }}>(Delay: {formatDuration(bs.delay_minutes)})</span>}
                                      <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{formatDuration(bs.duration_minutes)}</span>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Protocols Tab */}
      {activeTab === 'protocols' && (
        <div>
          <div style={{ marginBottom: 'var(--space-md)', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary btn-sm" onClick={() => {
              setEditingProtocol(null);
              setProtocolForm({ name: '', description: '', color: experiment?.color || '#6366F1', blocks: [] });
              setShowProtocolModal(true);
            }}>
              <Plus size={14} /> {t('experiments.addProtocol')}
            </button>
          </div>
          {protocols.length === 0 ? (
            <div className="empty-state"><p>{t('experiments.noProtocols')}</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {protocols.map(protocol => (
                <div key={protocol.id} className="card">
                  <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: protocol.color || 'var(--color-primary)' }} />
                      <h3 className="card-title">{protocol.name}</h3>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => {
                        setEditingProtocol(protocol);
                        setProtocolForm({
                          name: protocol.name, description: protocol.description || '', color: protocol.color || experiment?.color || '#6366F1',
                          blocks: protocol.blocks?.map((b: any) => ({ block_id: b.block_id, day_offset: b.day_offset })) || []
                        });
                        setShowProtocolModal(true);
                      }}><Edit size={14} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => copyProtocol(protocol.id)}><Copy size={14} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => deleteProtocol(protocol.id)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {protocol.description && <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>{protocol.description}</p>}
                  {protocol.blocks && protocol.blocks.length > 0 && (
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                      {protocol.blocks.map((pb: any, i: number) => (
                        <div key={pb.id || i} className="badge badge-info" style={{ padding: '6px 12px' }}>
                          {t('experiments.dayOffsetFormat', { day: pb.day_offset })}: {pb.block_name}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 'var(--space-sm)', fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                    {t('experiments.daysCount', { count: protocol.blocks && protocol.blocks.length > 0 ? Math.max(...protocol.blocks.map((b: any) => b.day_offset)) : 0 })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step Modal */}
      {showStepModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingStep ? t('experiments.editStep') : t('experiments.addStep')}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowStepModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div className="form-group">
                <label className="form-label">{t('experiments.stepName')} *</label>
                <input className="form-input" value={stepForm.name} onChange={e => setStepForm({ ...stepForm, name: e.target.value })} placeholder={t('experiments.stepNamePlaceholder')} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">{t('common.description')}</label>
                <textarea className="form-textarea" value={stepForm.description} onChange={e => setStepForm({ ...stepForm, description: e.target.value })} rows={2} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('experiments.durationMinutes')}</label>
                  <input className="form-input" type="number" min="0" value={stepForm.duration_minutes} onChange={e => setStepForm({ ...stepForm, duration_minutes: parseInt(e.target.value) || 0 })} disabled={stepForm.is_overnight} />
                  <label className="form-label mt-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="checkbox" checked={stepForm.is_sample_dependent} onChange={e => setStepForm({ ...stepForm, is_sample_dependent: e.target.checked })} />
                    サンプル数依存にする
                  </label>
                  {stepForm.is_sample_dependent && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                      <input className="form-input" type="number" min="1" value={stepForm.samples_per_batch} onChange={e => setStepForm({ ...stepForm, samples_per_batch: parseInt(e.target.value) || 1 })} style={{ width: '80px' }} />
                      <span>サンプルごとに所要時間を加算</span>
                    </div>
                  )}
                  <label className="form-checkbox" style={{ marginTop: 'var(--space-xs)' }}>
                    <input type="checkbox" checked={stepForm.is_overnight} onChange={e => setStepForm({ ...stepForm, is_overnight: e.target.checked, duration_minutes: e.target.checked ? 0 : stepForm.duration_minutes })} />
                    <span style={{ fontSize: 'var(--font-size-sm)' }}>{t('experiments.isOvernight', 'オーバーナイト (一晩放置)')}</span>
                  </label>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('experiments.patternLabel')}</label>
                  <input className="form-input" value={stepForm.pattern_label} onChange={e => setStepForm({ ...stepForm, pattern_label: e.target.value })} placeholder={t('experiments.patternLabelPlaceholder')} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">サブプロトコルを選択</label>
                <select className="form-input" value={stepForm.sub_protocol_id || ''} onChange={e => setStepForm({ ...stepForm, sub_protocol_id: e.target.value ? parseInt(e.target.value) : null })}>
                  <option value="">(なし)</option>
                  {subProtocols.map(sp => (
                    <option key={sp.id} value={sp.id}>{sp.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ padding: 'var(--space-md)', background: 'var(--bg-glass)', border: '1px solid var(--border-default)', borderRadius: 'var(--border-radius-md)', marginBottom: 'var(--space-md)' }}>
                <label className="form-checkbox" style={{ marginBottom: stepForm.routine_name ? 'var(--space-md)' : 0 }}>
                  <input type="checkbox" checked={!!stepForm.routine_name} onChange={e => {
                    if (e.target.checked) {
                      setStepForm({ ...stepForm, routine_name: stepForm.name ? `${stepForm.name} 確認` : '自動生成ルーティン', routine_duration_days: 7, routine_recurrence: 'daily' });
                    } else {
                      setStepForm({ ...stepForm, routine_name: '', routine_duration_days: 0, routine_recurrence: 'daily' });
                    }
                  }} />
                  <span style={{ fontWeight: '500' }}>完了時に自動でルーティンを生成する</span>
                </label>

                {!!stepForm.routine_name && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: 'var(--font-size-sm)' }}>ルーティン名</label>
                      <input className="form-input" value={stepForm.routine_name} onChange={e => setStepForm({ ...stepForm, routine_name: e.target.value })} />
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                      <div style={{ flex: 1 }}>
                        <label className="form-label" style={{ fontSize: 'var(--font-size-sm)' }}>期間 (実行日から何日間)</label>
                        <input type="number" className="form-input" value={stepForm.routine_duration_days} onChange={e => setStepForm({ ...stepForm, routine_duration_days: parseInt(e.target.value) || 0 })} min={1} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="form-label" style={{ fontSize: 'var(--font-size-sm)' }}>繰り返しパターン</label>
                        <select className="form-input" value={stepForm.routine_recurrence} onChange={e => setStepForm({ ...stepForm, routine_recurrence: e.target.value as any })}>
                          <option value="daily">毎日</option>
                          <option value="weekdays">平日のみ</option>
                          <option value="weekly">毎週</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t('experiments.preparations', '事前操作 / In-advance メッセージ')}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setStepForm({ ...stepForm, preparations: [...stepForm.preparations, { message: '', timing_type: 'before_experiment', timing_step_id: null, timing_offset_minutes: 0, requires_check: false }] })}>
                    <Plus size={14} /> 追加
                  </button>
                </label>
                {stepForm.preparations.map((prep, index) => (
                  <div key={index} style={{ border: '1px solid var(--border-default)', padding: 'var(--space-sm)', borderRadius: 'var(--border-radius-md)', marginBottom: 'var(--space-sm)' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-xs)' }}>
                      <input className="form-input" style={{ flex: 1 }} value={prep.message} onChange={e => { const newPreps = [...stepForm.preparations]; newPreps[index].message = e.target.value; setStepForm({ ...stepForm, preparations: newPreps }); }} placeholder="事前操作内容" />
                      <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => { const newPreps = [...stepForm.preparations]; newPreps.splice(index, 1); setStepForm({ ...stepForm, preparations: newPreps }); }}><Trash2 size={14} /></button>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
                      <select className="form-input" style={{ width: 'auto' }} value={prep.timing_type} onChange={e => { const newPreps = [...stepForm.preparations]; newPreps[index].timing_type = e.target.value; setStepForm({ ...stepForm, preparations: newPreps }); }}>
                        <option value="before_experiment">実験開始前</option>
                        <option value="after_step">特定のステップ終了時</option>
                      </select>
                      {prep.timing_type === 'before_experiment' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                          <input type="number" className="form-input" style={{ width: 80 }} value={prep.timing_offset_minutes} onChange={e => { const newPreps = [...stepForm.preparations]; newPreps[index].timing_offset_minutes = parseInt(e.target.value) || 0; setStepForm({ ...stepForm, preparations: newPreps }); }} />
                          <span style={{ fontSize: 'var(--font-size-sm)' }}>分前</span>
                        </div>
                      )}
                      {prep.timing_type === 'after_step' && (
                        <select className="form-input" style={{ width: 'auto' }} value={prep.timing_step_id || ''} onChange={e => { const newPreps = [...stepForm.preparations]; newPreps[index].timing_step_id = parseInt(e.target.value) || null; setStepForm({ ...stepForm, preparations: newPreps }); }}>
                          <option value="">-- ステップを選択 --</option>
                          {steps.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      )}
                      <label className="form-checkbox">
                        <input type="checkbox" checked={prep.requires_check} onChange={e => { const newPreps = [...stepForm.preparations]; newPreps[index].requires_check = e.target.checked; setStepForm({ ...stepForm, preparations: newPreps }); }} />
                        <span style={{ fontSize: 'var(--font-size-sm)' }}>完了チェックが必要</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowStepModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleStepSubmit} disabled={!stepForm.name.trim()}>{editingStep ? t('common.save') : t('common.create')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Block Modal */}
      {showBlockModal && (
        <div className="modal-overlay">
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingBlock ? t('experiments.editBlock') : t('experiments.addBlock')}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowBlockModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('experiments.blockName')} *</label>
                  <input className="form-input" value={blockForm.name} onChange={e => setBlockForm({ ...blockForm, name: e.target.value })} placeholder={t('experiments.blockNamePlaceholder')} autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('experiments.patternLabel')}</label>
                  <input className="form-input" value={blockForm.pattern_label} onChange={e => setBlockForm({ ...blockForm, pattern_label: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('common.description')}</label>
                <textarea className="form-textarea" value={blockForm.description} onChange={e => setBlockForm({ ...blockForm, description: e.target.value })} rows={2} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('experiments.selectSteps')}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                  {blockForm.step_nodes.length === 0 ? (
                    <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>追加されたステップはありません</p>
                  ) : (
                    blockForm.step_nodes.map((stage, stageIndex) => (
                      <div key={stageIndex} style={{ padding: 'var(--space-sm)', borderRadius: 'var(--border-radius-md)', border: '1px solid var(--border-default)', backgroundColor: 'var(--bg-secondary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-xs)' }}>
                          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'bold' }}>Stage {stageIndex + 1}</span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-icon btn-sm" disabled={stageIndex === 0} onClick={() => {
                              const newNodes = [...blockForm.step_nodes];
                              [newNodes[stageIndex - 1], newNodes[stageIndex]] = [newNodes[stageIndex], newNodes[stageIndex - 1]];
                              setBlockForm({ ...blockForm, step_nodes: newNodes });
                            }}><ArrowUp size={14} /></button>
                            <button className="btn btn-ghost btn-icon btn-sm" disabled={stageIndex === blockForm.step_nodes.length - 1} onClick={() => {
                              const newNodes = [...blockForm.step_nodes];
                              [newNodes[stageIndex], newNodes[stageIndex + 1]] = [newNodes[stageIndex + 1], newNodes[stageIndex]];
                              setBlockForm({ ...blockForm, step_nodes: newNodes });
                            }}><ArrowDown size={14} /></button>
                            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => {
                              const newNodes = [...blockForm.step_nodes];
                              newNodes.splice(stageIndex, 1);
                              setBlockForm({ ...blockForm, step_nodes: newNodes });
                            }}><Trash2 size={14} /></button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-md)', overflowX: 'auto', paddingBottom: 8 }}>
                          {stage.map((branch, branchIndex) => (
                            <div key={branchIndex} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', minWidth: 200, backgroundColor: 'var(--bg-primary)', padding: 'var(--space-xs)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-default)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Branch {branchIndex + 1}</span>
                                <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => {
                                  const newNodes = [...blockForm.step_nodes];
                                  newNodes[stageIndex].splice(branchIndex, 1);
                                  if (newNodes[stageIndex].length === 0) newNodes.splice(stageIndex, 1);
                                  setBlockForm({ ...blockForm, step_nodes: newNodes });
                                }}><Trash2 size={12} /></button>
                              </div>
                              {branch.map((node, nodeIndex) => {
                                const step = steps.find(s => s.id === node.step_id);
                                if (!step) return null;
                                return (
                                  <div key={`${node.step_id}-${nodeIndex}`} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 4, backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-default)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ fontSize: 'var(--font-size-sm)' }}>{step.name}</span>
                                      <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => {
                                        const newNodes = [...blockForm.step_nodes];
                                        newNodes[stageIndex][branchIndex].splice(nodeIndex, 1);
                                        let currentDelay = 0;
                                        newNodes[stageIndex][branchIndex].forEach(n => {
                                          n.delay_minutes = currentDelay;
                                          const s = steps.find(st => st.id === n.step_id);
                                          if (s) currentDelay += s.duration_minutes;
                                        });
                                        if (newNodes[stageIndex][branchIndex].length === 0) newNodes[stageIndex].splice(branchIndex, 1);
                                        if (newNodes[stageIndex].length === 0) newNodes.splice(stageIndex, 1);
                                        setBlockForm({ ...blockForm, step_nodes: newNodes });
                                      }}><Trash2 size={12} /></button>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-tertiary)' }}>
                                      <span>所要: {formatDuration(step.duration_minutes)}</span>
                                      {nodeIndex === 0 && branchIndex > 0 ? (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                          開始: +<input 
                                            type="number" 
                                            value={node.delay_minutes} 
                                            onChange={e => {
                                              const val = Math.max(0, parseInt(e.target.value) || 0);
                                              const newNodes = [...blockForm.step_nodes];
                                              newNodes[stageIndex][branchIndex][nodeIndex].delay_minutes = val;
                                              let currentDelay = val;
                                              for (let k = 1; k < newNodes[stageIndex][branchIndex].length; k++) {
                                                const prevNode = newNodes[stageIndex][branchIndex][k - 1];
                                                const prevStep = steps.find(st => st.id === prevNode.step_id);
                                                currentDelay += prevStep?.duration_minutes || 0;
                                                newNodes[stageIndex][branchIndex][k].delay_minutes = currentDelay;
                                              }
                                              setBlockForm({ ...blockForm, step_nodes: newNodes });
                                            }}
                                            style={{ width: 45, padding: '0 2px', fontSize: '10px', height: 18 }} 
                                          />分
                                        </span>
                                      ) : (
                                        <span>開始: +{formatDuration(node.delay_minutes)}</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                              <select className="form-input" style={{ padding: '2px 8px', fontSize: '11px', marginTop: 'auto' }} value="" onChange={e => {
                                if (e.target.value) {
                                  const newNodes = [...blockForm.step_nodes];
                                  const b = newNodes[stageIndex][branchIndex];
                                  const stepId = parseInt(e.target.value);
                                  let delay = 0;
                                  if (b.length > 0) {
                                    const lastNode = b[b.length - 1];
                                    const lastStep = steps.find(s => s.id === lastNode.step_id);
                                    delay = lastNode.delay_minutes + (lastStep?.duration_minutes || 0);
                                  }
                                  b.push({ step_id: stepId, delay_minutes: delay });
                                  setBlockForm({ ...blockForm, step_nodes: newNodes });
                                }
                              }}>
                                <option value="">{branch.length === 0 ? "-- ステップを選択 --" : "-- 直列に追加 --"}</option>
                                {steps.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </div>
                          ))}
                          <div style={{ display: 'flex', alignItems: 'center', padding: 'var(--space-xs)' }}>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-tertiary)', fontSize: '11px', border: '1px dashed var(--border-default)' }} onClick={() => {
                              const newNodes = [...blockForm.step_nodes];
                              newNodes[stageIndex].push([]);
                              setBlockForm({ ...blockForm, step_nodes: newNodes });
                            }}>+ ブランチを追加</button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                    <select className="form-input" id="block-new-stage-select" style={{ flex: 1 }} value="" onChange={e => {
                      if (e.target.value) {
                        setBlockForm({ ...blockForm, step_nodes: [...blockForm.step_nodes, [[{ step_id: parseInt(e.target.value), delay_minutes: 0 }]]] });
                      }
                    }}>
                      <option value="">-- 新しいステージを追加 --</option>
                      {steps.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowBlockModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleBlockSubmit} disabled={!blockForm.name.trim()}>{editingBlock ? t('common.save') : t('common.create')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Protocol Modal */}
      {showProtocolModal && (
        <div className="modal-overlay">
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingProtocol ? t('experiments.editProtocol') : t('experiments.addProtocol')}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowProtocolModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('experiments.protocolName')} *</label>
                  <input className="form-input" value={protocolForm.name} onChange={e => setProtocolForm({ ...protocolForm, name: e.target.value })} placeholder={t('experiments.protocolNamePlaceholder')} autoFocus />
                </div>
                <div className="form-group" style={{ maxWidth: '100px' }}>
                  <label className="form-label">色設定</label>
                  <input type="color" className="form-input" value={protocolForm.color} onChange={e => setProtocolForm({ ...protocolForm, color: e.target.value })} style={{ width: '100%', height: '40px', padding: 0 }} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('common.description')}</label>
                <textarea className="form-textarea" value={protocolForm.description} onChange={e => setProtocolForm({ ...protocolForm, description: e.target.value })} rows={2} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('experiments.selectBlocks')}</label>
                {blocks.length === 0 ? (
                  <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>{t('experiments.noBlocks')}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    {protocolForm.blocks.map((pb, index) => (
                      <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                          <select className="form-select" value={pb.block_id} onChange={e => {
                            const newBlocks = [...protocolForm.blocks];
                            newBlocks[index] = { ...newBlocks[index]!, block_id: parseInt(e.target.value) };
                            setProtocolForm({ ...protocolForm, blocks: newBlocks });
                          }}>
                            <option value={0}>-- {t('experiments.selectBlocks')} --</option>
                            {blocks.map(b => <option key={b.id} value={b.id}>{b.name} {b.pattern_label !== 'default' ? `[${b.pattern_label}]` : ''}</option>)}
                          </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{t('experiments.dayOffset')}</span>
                          <input className="form-input" type="number" min="1" value={pb.day_offset} style={{ width: 70 }}
                            onChange={e => {
                              const newBlocks = [...protocolForm.blocks];
                              newBlocks[index] = { ...newBlocks[index]!, day_offset: parseInt(e.target.value) || 1 };
                              setProtocolForm({ ...protocolForm, blocks: newBlocks });
                            }}
                          />
                        </div>
                        <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => {
                          setProtocolForm({ ...protocolForm, blocks: protocolForm.blocks.filter((_, i) => i !== index) });
                        }}><Trash2 size={14} /></button>
                      </div>
                    ))}
                    <button className="btn btn-secondary btn-sm" onClick={() => {
                      setProtocolForm({ ...protocolForm, blocks: [...protocolForm.blocks, { block_id: 0, day_offset: protocolForm.blocks.length + 1 }] });
                    }}>
                      <Plus size={14} /> {t('experiments.addBlock')}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowProtocolModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleProtocolSubmit} disabled={!protocolForm.name.trim()}>
                {editingProtocol ? t('common.save') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Import Step Modal */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">他の実験種からステップをインポート</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowImportModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">インポート元の実験種</label>
                <select className="form-input" value={importSelectedExpId || ''} onChange={e => loadImportSteps(parseInt(e.target.value))}>
                  <option value="">-- 選択してください --</option>
                  {allExperiments.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              
              {importSelectedExpId && (
                <div className="form-group">
                  <label className="form-label">インポートするステップ</label>
                  {importSteps.length === 0 ? (
                    <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)' }}>ステップが登録されていません</p>
                  ) : (
                    <select className="form-input" value={importSelectedStepId || ''} onChange={e => setImportSelectedStepId(parseInt(e.target.value))}>
                      <option value="">-- ステップを選択 --</option>
                      {importSteps.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.duration_minutes}分)</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowImportModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleImportSubmit} disabled={!importSelectedStepId || importing}>
                {importing ? 'インポート中...' : 'インポート'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
