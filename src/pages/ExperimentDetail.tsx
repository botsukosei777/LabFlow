import { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, Trash2, Edit, Clock, GripVertical, Check, FileText, ArrowUp, ArrowDown } from 'lucide-react';
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
  const [stepForm, setStepForm] = useState({ name: '', description: '', duration_minutes: 0, is_overnight: false, pattern_label: 'default', sub_protocol_id: null as number | null, preparations: [] as any[] });

  // Block form
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [editingBlock, setEditingBlock] = useState<any>(null);
  const [blockForm, setBlockForm] = useState({ name: '', description: '', pattern_label: 'default', step_ids: [] as number[] });

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
  const [protocolForm, setProtocolForm] = useState({ name: '', description: '', blocks: [] as { block_id: number; day_offset: number }[] });



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
      setStepForm({ name: '', description: '', duration_minutes: 0, is_overnight: false, pattern_label: 'default', sub_protocol: '', preparations: [] });
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
      setBlockForm({ name: '', description: '', pattern_label: 'default', step_ids: [] });
      fetchData();
    } catch (error: any) {
      addToast('error', error.message || t('common.errorOccurred'));
    }
  };

  const deleteBlock = async (blockId: number) => {
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
    try {
      await api.delete(`/experiments/protocols/${protocolId}`);
      addToast('success', t('common.deletedSuccessfully'));
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
              setStepForm({ name: '', description: '', duration_minutes: 0, is_overnight: false, pattern_label: selectedPattern !== 'all' ? selectedPattern : 'default', sub_protocol: '', preparations: [] });
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
                      setStepForm({ name: step.name, description: step.description || '', duration_minutes: step.duration_minutes, is_overnight: !!step.is_overnight, pattern_label: step.pattern_label, sub_protocol: step.sub_protocol || '', preparations: step.preparations || [] });
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
              setBlockForm({ name: '', description: '', pattern_label: selectedPattern !== 'all' ? selectedPattern : 'default', step_ids: [] });
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
                        setBlockForm({
                          name: block.name, description: block.description || '', pattern_label: block.pattern_label,
                          step_ids: block.steps?.map((s: any) => s.step_id) || []
                        });
                        setShowBlockModal(true);
                      }}><Edit size={14} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => deleteBlock(block.id)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {block.description && <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>{block.description}</p>}
                  {block.steps && block.steps.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 'var(--space-md)', borderLeft: '2px solid var(--border-default)' }}>
                      {block.steps.map((bs: any) => (
                        <div key={bs.id} style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                          <span>{bs.step_name}</span>
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>{bs.duration_minutes}{t('common.minutes')}</span>
                        </div>
                      ))}
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
              setProtocolForm({ name: '', description: '', blocks: [] });
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
                    <h3 className="card-title">{protocol.name}</h3>
                    <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => {
                        setEditingProtocol(protocol);
                        setProtocolForm({
                          name: protocol.name, description: protocol.description || '',
                          blocks: protocol.blocks?.map((b: any) => ({ block_id: b.block_id, day_offset: b.day_offset })) || []
                        });
                        setShowProtocolModal(true);
                      }}><Edit size={14} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => deleteProtocol(protocol.id)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {protocol.description && <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>{protocol.description}</p>}
                  {protocol.blocks && protocol.blocks.length > 0 && (
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                      {protocol.blocks.map((pb: any, i: number) => (
                        <div key={pb.id || i} className="badge badge-info" style={{ padding: '6px 12px' }}>
                          {t('experiments.dayOffset')} {pb.day_offset}: {pb.block_name}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                  {blockForm.step_ids.length === 0 ? (
                    <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>追加されたステップはありません</p>
                  ) : (
                    blockForm.step_ids.map((stepId, index) => {
                      const step = steps.find(s => s.id === stepId);
                      if (!step) return null;
                      return (
                        <div key={`${step.id}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: 'var(--space-xs) var(--space-sm)', borderRadius: 'var(--border-radius-md)', border: '1px solid var(--border-default)', backgroundColor: 'var(--bg-secondary)' }}>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{index + 1}. {step.name}</span>
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                              {step.pattern_label !== 'default' ? `[${step.pattern_label}] ` : ''}{step.is_overnight ? 'Overnight' : formatDuration(step.duration_minutes)}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 2 }}>
                            <button 
                              className="btn btn-ghost btn-icon btn-sm" 
                              disabled={index === 0}
                              onClick={() => {
                                const newIds = [...blockForm.step_ids];
                                [newIds[index - 1], newIds[index]] = [newIds[index], newIds[index - 1]];
                                setBlockForm({ ...blockForm, step_ids: newIds });
                              }}
                            ><ArrowUp size={14} /></button>
                            <button 
                              className="btn btn-ghost btn-icon btn-sm" 
                              disabled={index === blockForm.step_ids.length - 1}
                              onClick={() => {
                                const newIds = [...blockForm.step_ids];
                                [newIds[index], newIds[index + 1]] = [newIds[index + 1], newIds[index]];
                                setBlockForm({ ...blockForm, step_ids: newIds });
                              }}
                            ><ArrowDown size={14} /></button>
                            <button 
                              className="btn btn-ghost btn-icon btn-sm" 
                              style={{ color: 'var(--color-danger)' }}
                              onClick={() => {
                                const newIds = [...blockForm.step_ids];
                                newIds.splice(index, 1);
                                setBlockForm({ ...blockForm, step_ids: newIds });
                              }}
                            ><Trash2 size={14} /></button>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div style={{ marginTop: 'var(--space-sm)', display: 'flex', gap: 'var(--space-sm)' }}>
                    <select 
                      className="form-input" 
                      id="block-step-add-select"
                      style={{ flex: 1 }}
                    >
                      <option value="">-- ステップを選択して追加 --</option>
                      {steps.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button 
                      className="btn btn-secondary"
                      onClick={() => {
                        const select = document.getElementById('block-step-add-select') as HTMLSelectElement;
                        if (select && select.value) {
                          setBlockForm({ ...blockForm, step_ids: [...blockForm.step_ids, parseInt(select.value)] });
                          select.value = "";
                        }
                      }}
                    >
                      追加
                    </button>
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
              <div className="form-group">
                <label className="form-label">{t('experiments.protocolName')} *</label>
                <input className="form-input" value={protocolForm.name} onChange={e => setProtocolForm({ ...protocolForm, name: e.target.value })} placeholder={t('experiments.protocolNamePlaceholder')} autoFocus />
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
