import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Database as DatabaseIcon, Plus, Search, Trash2, Edit3, Download,
  Check, X, ChevronDown, Tag, Dna, FlaskConical, Shield, Settings,
  Calendar, CheckSquare, Square, FileText, AlertCircle, Copy, Sparkles, Filter
} from 'lucide-react';
import { api } from '../../api/client';

export interface ColumnDef {
  key: string;
  name: string;
  type: 'text' | 'sequence' | 'number' | 'select' | 'date' | 'checkbox' | 'tags' | 'textarea';
  required?: boolean;
  options?: string[]; // for select
  hint?: string;
  computed?: boolean; // length, tm
}

export interface CustomDb {
  id: number;
  name: string;
  description: string;
  category: string;
  columns: ColumnDef[];
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface CustomDbItem {
  id: number;
  database_id: number;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// ─── DNA / Primer Tm & Length Auto-Calculation ───
export function cleanDnaSequence(seq: string): string {
  return (seq || '').toUpperCase().replace(/[^ATGCNU]/g, '');
}

export function calcSequenceLength(seq: string): number {
  return cleanDnaSequence(seq).length;
}

export function calcTmValue(seq: string): number {
  const clean = cleanDnaSequence(seq);
  const len = clean.length;
  if (len === 0) return 0;

  let a = 0, t = 0, g = 0, c = 0;
  for (const base of clean) {
    if (base === 'A') a++;
    else if (base === 'T' || base === 'U') t++;
    else if (base === 'G') g++;
    else if (base === 'C') c++;
  }

  if (len < 14) {
    // Wallace rule for short oligos
    return (a + t) * 2 + (g + c) * 4;
  } else {
    // Standard empirical Marmur formula with salt correction approximation
    const tm = 64.9 + 41 * (g + c - 16.4) / len;
    return Number(tm.toFixed(1));
  }
}

// ─── Preset Templates ───
export const PRESET_TEMPLATES: {
  id: string;
  name: string;
  icon: any;
  color: string;
  description: string;
  category: string;
  columns: ColumnDef[];
}[] = [
  {
    id: 'primers',
    name: 'プライマー/核酸オリゴ管理',
    icon: Dna,
    color: '#06B6D4',
    description: 'PCR・qPCR・シーケンス・FISHプローブ等の配列・塩基長・Tm値・発注・work状況を管理',
    category: 'oligo',
    columns: [
      { key: 'primer_code', name: 'プライマーコードID', type: 'text', required: true, hint: 'アルファベット・数字（例: P-001, Fwd_Actin1）' },
      { key: 'oligo_type', name: '種別', type: 'select', required: true, options: ['PCRプライマー', 'qPCRプライマー', 'シーケンス用', 'FISH用オリゴ', 'クローニング用', 'その他'] },
      { key: 'sequence', name: '配列 (5\'→3\')', type: 'sequence', required: true, hint: '塩基長・Tm値が自動計算されます' },
      { key: 'length', name: '配列長 (bp)', type: 'number', computed: true },
      { key: 'tm', name: 'Tm値 (℃)', type: 'number', computed: true },
      { key: 'order_status', name: '発注日/発注の有無', type: 'select', options: ['未発注', '発注済 (納期確認中)', '納品済 (使用可能)', '在庫切れ/再発注必要'] },
      { key: 'order_date', name: '発注日', type: 'date' },
      { key: 'projects', name: 'プロジェクト名', type: 'tags', hint: '使いまわし可能なタグ' },
      { key: 'pair_primer', name: 'ペアとなるプライマー番号', type: 'text', hint: 'ペアのRevプライマー番号等' },
      { key: 'worked', name: 'workしたかどうか', type: 'select', options: ['良好 (Worked)', '微弱 (Weak)', '未確認 (Untested)', '機能せず (Failed)'] },
      { key: 'storage_location', name: '保管場所', type: 'text', hint: '-20℃冷凍庫 Box A-1 等' },
      { key: 'notes', name: '備考/用途', type: 'textarea' },
    ]
  },
  {
    id: 'transformants',
    name: '形質転換体等の管理',
    icon: FlaskConical,
    color: '#10B981',
    description: '植物・動物・微生物等の形質転換体、系統、導入遺伝子、世代数、子孫数、ジェノタイピング状況を管理',
    category: 'sample',
    columns: [
      { key: 'individual_id', name: '個体識別ID', type: 'text', required: true, hint: '例: TF-2026-001' },
      { key: 'background_strain', name: 'バックグラウンド系統/品種', type: 'text', required: true, hint: '例: Col-0, C57BL/6, DH5α, BY-2' },
      { key: 'transgenes', name: '形質転換した遺伝子等の名', type: 'tags', required: true, hint: 'プロモーター・導入遺伝子タグ' },
      { key: 'genotyped', name: 'ジェノタイピング実施', type: 'checkbox' },
      { key: 'generation', name: '現世代数', type: 'text', hint: '例: T0, T4, M2, G3, F1 など' },
      { key: 'progeny_count', name: '子孫の数', type: 'number' },
      { key: 'selection_marker', name: '選抜マーカー/耐性', type: 'text', hint: 'Kanamycin, Hygromycin, GFP等' },
      { key: 'storage_location', name: '保管場所/インキュベーター', type: 'text' },
      { key: 'notes', name: '表現型/備考', type: 'textarea' },
    ]
  },
  {
    id: 'antibodies',
    name: '抗体の管理',
    icon: Shield,
    color: '#EC4899',
    description: '一次/二次抗体の宿主動物、抗原名、希釈倍率、work状況、標識物質、使用用途を管理',
    category: 'antibody',
    columns: [
      { key: 'antibody_id', name: '抗体のID', type: 'text', required: true, hint: '例: Ab-042, anti-GFP' },
      { key: 'ab_type', name: '一次/二次抗体の種別', type: 'select', required: true, options: ['一次抗体 (Primary)', '二次抗体 (Secondary)'] },
      { key: 'host_animal', name: '免疫動物', type: 'select', options: ['Rabbit (ウサギ)', 'Mouse (マウス)', 'Goat (ヤギ)', 'Rat (ラット)', 'Guinea Pig (モルモット)', 'Chicken (ニワトリ)', 'Donkey (ロバ)', 'その他'] },
      { key: 'antigen', name: '抗原名またはペプチド配列', type: 'text', required: true },
      { key: 'worked', name: 'workしたかどうか', type: 'select', options: ['良好 (Worked)', '微弱 (Weak)', '未確認 (Untested)', '機能せず (Failed)'] },
      { key: 'conjugate', name: '付加した物質 (標識)', type: 'text', hint: 'HRP, Alexa Fluor 488, FITC, Biotin, なし 等' },
      { key: 'applications', name: '使用用途', type: 'tags', hint: 'WB, IHC, IF, IP, ELISA, ChIP, Flow Cytometry' },
      { key: 'clonality', name: 'モノクローナル/ポリクローナル', type: 'select', options: ['Monoclonal', 'Polyclonal', 'Recombinant'] },
      { key: 'storage_location', name: '保管場所', type: 'text', hint: '-20℃ Box B-3 等' },
      { key: 'notes', name: '希釈倍率/備考', type: 'textarea' },
    ]
  }
];

// ─── Tag Input Component (with auto-suggest from previous entries) ───
const TagInput = ({
  value = [],
  onChange,
  allSuggestions = [],
  placeholder = 'Enter tags...'
}: {
  value?: string[];
  onChange: (val: string[]) => void;
  allSuggestions?: string[];
  placeholder?: string;
}) => {
  const [inputVal, setInputVal] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = inputVal.trim().toLowerCase();
    return allSuggestions.filter(s => s && s.toLowerCase().includes(q) && !(value || []).includes(s));
  }, [allSuggestions, inputVal, value]);

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (!t) return;
    if (!(value || []).includes(t)) {
      onChange([...(value || []), t]);
    }
    setInputVal('');
    setIsOpen(false);
  };

  const removeTag = (tag: string) => {
    onChange((value || []).filter(t => t !== tag));
  };

  return (
    <div className="relative">
      <div
        className="flex flex-wrap gap-1.5 p-2 bg-white/5 border border-white/10 rounded-lg min-h-[38px] items-center cursor-text focus-within:border-indigo-500 transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {(value || []).map((t, idx) => (
          <span key={idx} className="flex items-center gap-1 bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded text-xs border border-indigo-500/30">
            {t}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(t); }}
              className="hover:text-white rounded p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => { setInputVal(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ',') && inputVal.trim()) {
              e.preventDefault();
              addTag(inputVal);
            } else if (e.key === 'Backspace' && !inputVal && (value || []).length > 0) {
              removeTag((value || [])[(value || []).length - 1]);
            }
          }}
          placeholder={(value || []).length === 0 ? placeholder : ''}
          className="bg-transparent border-none outline-none text-xs flex-1 min-w-[100px] text-white"
        />
      </div>

      {isOpen && (filtered.length > 0 || (inputVal.trim() && !(value || []).includes(inputVal.trim()))) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1f2e] border border-white/15 rounded-lg shadow-2xl z-50 max-h-[160px] overflow-y-auto custom-scrollbar p-1">
          {inputVal.trim() && !(value || []).includes(inputVal.trim()) && (
            <div
              className="px-2.5 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20 rounded cursor-pointer flex items-center gap-1.5"
              onMouseDown={(e) => { e.preventDefault(); addTag(inputVal); }}
            >
              <Plus className="w-3 h-3" /> + 「{inputVal.trim()}」
            </div>
          )}
          {filtered.map((s, i) => (
            <div
              key={i}
              className="px-2.5 py-1.5 text-xs text-gray-300 hover:bg-white/10 hover:text-white rounded cursor-pointer flex items-center gap-1.5"
              onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
            >
              <Tag className="w-3 h-3 text-indigo-400" /> {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───
export const CustomDatabaseManager: React.FC = () => {
  const { t } = useTranslation();
  const [databases, setDatabases] = useState<CustomDb[]>([]);
  const [activeDbId, setActiveDbId] = useState<number | null>(null);
  const [items, setItems] = useState<CustomDbItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showCreateDbModal, setShowCreateDbModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<CustomDbItem | null>(null);
  const [itemFormData, setItemFormData] = useState<Record<string, any>>({});

  // DB Creation Form State
  const [newDbName, setNewDbName] = useState('');
  const [newDbDesc, setNewDbDesc] = useState('');
  const [newDbCategory, setNewDbCategory] = useState('general');
  const [newDbColumns, setNewDbColumns] = useState<ColumnDef[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('primers');

  // ─── Dynamic Localization Helpers for Presets & Stored Custom Databases ───
  const getPresetIdForDb = useCallback((db: { name?: string; category?: string } | null): string | null => {
    if (!db) return null;
    if (
      db.category === 'oligo' ||
      db.name === 'プライマー/核酸オリゴ管理' ||
      db.name === 'Primer / Oligo Management' ||
      db.name === 'Primer / Nucleic Acid Oligo Management'
    ) {
      return 'primers';
    }
    if (
      db.category === 'sample' ||
      db.name === '形質転換体等の管理' ||
      db.name === 'Transformants & Strains Management'
    ) {
      return 'transformants';
    }
    if (
      db.category === 'antibody' ||
      db.name === '抗体の管理' ||
      db.name === 'Antibody Management'
    ) {
      return 'antibodies';
    }
    return null;
  }, []);

  const localizeDbName = useCallback((db: CustomDb | null): string => {
    if (!db) return '';
    const presetId = getPresetIdForDb(db);
    if (presetId) {
      return t(`customDatabases.presets.${presetId}.name`, db.name);
    }
    return db.name;
  }, [getPresetIdForDb, t]);

  const localizeDbDesc = useCallback((db: CustomDb | null): string => {
    if (!db) return '';
    const presetId = getPresetIdForDb(db);
    if (presetId) {
      return t(`customDatabases.presets.${presetId}.description`, db.description || '');
    }
    return db.description || '';
  }, [getPresetIdForDb, t]);

  const COLUMN_NAME_TO_KEY_MAP: Record<string, { preset: string; key: string }> = useMemo(() => ({
    'プライマーコードID': { preset: 'primers', key: 'primerCode' },
    '種別': { preset: 'primers', key: 'oligoType' },
    "配列 (5'→3')": { preset: 'primers', key: 'sequence' },
    '配列長 (bp)': { preset: 'primers', key: 'length' },
    'Tm値 (℃)': { preset: 'primers', key: 'tm' },
    '発注日/発注の有無': { preset: 'primers', key: 'orderStatus' },
    '発注日': { preset: 'primers', key: 'orderDate' },
    'プロジェクト名': { preset: 'primers', key: 'projects' },
    'ペアとなるプライマー番号': { preset: 'primers', key: 'pairPrimer' },
    'workしたかどうか': { preset: 'primers', key: 'worked' },
    '保管場所': { preset: 'primers', key: 'storageLocation' },
    '備考/用途': { preset: 'primers', key: 'notes' },
    '個体識別ID': { preset: 'transformants', key: 'individualId' },
    'バックグラウンド系統/品種': { preset: 'transformants', key: 'backgroundStrain' },
    '形質転換した遺伝子等の名': { preset: 'transformants', key: 'transgenes' },
    'ジェノタイピング実施': { preset: 'transformants', key: 'genotyped' },
    '現世代数': { preset: 'transformants', key: 'generation' },
    '子孫の数': { preset: 'transformants', key: 'progenyCount' },
    '選抜マーカー/耐性': { preset: 'transformants', key: 'selectionMarker' },
    '保管場所/インキュベーター': { preset: 'transformants', key: 'storageLocation' },
    '表現型/備考': { preset: 'transformants', key: 'notes' },
    '抗体のID': { preset: 'antibodies', key: 'antibodyId' },
    '一次/二次抗体の種別': { preset: 'antibodies', key: 'abType' },
    '免疫動物': { preset: 'antibodies', key: 'hostAnimal' },
    '抗原名またはペプチド配列': { preset: 'antibodies', key: 'antigen' },
    '付加した物質 (標識)': { preset: 'antibodies', key: 'conjugate' },
    '使用用途': { preset: 'antibodies', key: 'applications' },
    'モノクローナル/ポリクローナル': { preset: 'antibodies', key: 'clonality' },
    '希釈倍率/備考': { preset: 'antibodies', key: 'notes' },
  }), []);

  const localizeColumnName = useCallback((col: ColumnDef, db?: CustomDb | null): string => {
    const presetId = db ? getPresetIdForDb(db) : null;
    const camelKey = col.key.replace(/_([a-z])/g, (_, g) => g.toUpperCase());

    if (presetId) {
      const keyPath = `customDatabases.presets.${presetId}.${camelKey}`;
      const translated = t(keyPath, '');
      if (translated && translated !== keyPath) return translated;
    }

    if (COLUMN_NAME_TO_KEY_MAP[col.name]) {
      const { preset, key } = COLUMN_NAME_TO_KEY_MAP[col.name];
      const keyPath = `customDatabases.presets.${preset}.${key}`;
      const translated = t(keyPath, '');
      if (translated && translated !== keyPath) return translated;
    }

    for (const pid of ['primers', 'transformants', 'antibodies']) {
      const keyPath = `customDatabases.presets.${pid}.${camelKey}`;
      const translated = t(keyPath, '');
      if (translated && translated !== keyPath) return translated;
    }

    if (col.name === '名前/タイトル' || col.key === 'title') {
      return t('common.name', col.name);
    }
    if (col.name === '備考' || col.key === 'notes') {
      return t('common.notes', col.name);
    }

    return col.name;
  }, [getPresetIdForDb, COLUMN_NAME_TO_KEY_MAP, t]);

  const localizeColumnHint = useCallback((col: ColumnDef, db?: CustomDb | null): string => {
    if (!col.hint) return '';
    const presetId = db ? getPresetIdForDb(db) : null;
    const camelKey = col.key.replace(/_([a-z])/g, (_, g) => g.toUpperCase());

    if (presetId) {
      const keyPath = `customDatabases.presets.${presetId}.${camelKey}Hint`;
      const translated = t(keyPath, '');
      if (translated && translated !== keyPath) return translated;
    }

    if (COLUMN_NAME_TO_KEY_MAP[col.name]) {
      const { preset, key } = COLUMN_NAME_TO_KEY_MAP[col.name];
      const keyPath = `customDatabases.presets.${preset}.${key}Hint`;
      const translated = t(keyPath, '');
      if (translated && translated !== keyPath) return translated;
    }

    for (const pid of ['primers', 'transformants', 'antibodies']) {
      const keyPath = `customDatabases.presets.${pid}.${camelKey}Hint`;
      const translated = t(keyPath, '');
      if (translated && translated !== keyPath) return translated;
    }

    return col.hint;
  }, [getPresetIdForDb, COLUMN_NAME_TO_KEY_MAP, t]);

  const OPTION_TRANSLATION_MAP: Record<string, string> = useMemo(() => ({
    'PCRプライマー': 'customDatabases.options.pcrPrimer',
    'PCR Primer': 'customDatabases.options.pcrPrimer',
    'qPCRプライマー': 'customDatabases.options.qpcrPrimer',
    'qPCR Primer': 'customDatabases.options.qpcrPrimer',
    'シーケンス用': 'customDatabases.options.sequencing',
    'Sequencing': 'customDatabases.options.sequencing',
    'FISH用オリゴ': 'customDatabases.options.fishProbe',
    'FISH Probe': 'customDatabases.options.fishProbe',
    'クローニング用': 'customDatabases.options.cloning',
    'Cloning': 'customDatabases.options.cloning',
    'その他': 'customDatabases.options.other',
    'Other': 'customDatabases.options.other',
    '未発注': 'customDatabases.options.notOrdered',
    'Not Ordered': 'customDatabases.options.notOrdered',
    '発注済 (納期確認中)': 'customDatabases.options.orderedPending',
    'Ordered (Pending Delivery)': 'customDatabases.options.orderedPending',
    'Ordered (Pending)': 'customDatabases.options.orderedPending',
    '納品済 (使用可能)': 'customDatabases.options.deliveredReady',
    'Delivered (Available)': 'customDatabases.options.deliveredReady',
    'Delivered (Ready)': 'customDatabases.options.deliveredReady',
    '在庫切れ/再発注必要': 'customDatabases.options.outOfStock',
    'Out of Stock / Reorder Needed': 'customDatabases.options.outOfStock',
    '一次抗体 (Primary)': 'customDatabases.options.primaryAb',
    'Primary Antibody': 'customDatabases.options.primaryAb',
    '二次抗体 (Secondary)': 'customDatabases.options.secondaryAb',
    'Secondary Antibody': 'customDatabases.options.secondaryAb',
    'Rabbit (ウサギ)': 'customDatabases.options.rabbit',
    'Rabbit': 'customDatabases.options.rabbit',
    'Mouse (マウス)': 'customDatabases.options.mouse',
    'Mouse': 'customDatabases.options.mouse',
    'Goat (ヤギ)': 'customDatabases.options.goat',
    'Goat': 'customDatabases.options.goat',
    'Rat (ラット)': 'customDatabases.options.rat',
    'Rat': 'customDatabases.options.rat',
    'Guinea Pig (モルモット)': 'customDatabases.options.guineaPig',
    'Guinea Pig': 'customDatabases.options.guineaPig',
    'Chicken (ニワトリ)': 'customDatabases.options.chicken',
    'Chicken': 'customDatabases.options.chicken',
    'Donkey (ロバ)': 'customDatabases.options.donkey',
    'Donkey': 'customDatabases.options.donkey'
  }), []);

  const localizeOptionValue = useCallback((val: string): string => {
    if (!val) return '';
    const key = OPTION_TRANSLATION_MAP[val];
    if (key) return t(key, val);
    return val;
  }, [OPTION_TRANSLATION_MAP, t]);

  // Load databases
  const fetchDatabases = async () => {
    setLoading(true);
    try {
      const data = await api.get<CustomDb[]>('/custom-databases');
      setDatabases(data);
      if (data.length > 0 && (activeDbId === null || !data.some(d => d.id === activeDbId))) {
        setActiveDbId(data[0].id);
      }
    } catch (e) {
      console.error('Failed to load custom databases:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDatabases();
  }, []);

  // Load items when activeDbId changes
  const activeDb = useMemo(() => databases.find(d => d.id === activeDbId) || null, [databases, activeDbId]);

  const fetchItems = async (dbId: number) => {
    setItemsLoading(true);
    try {
      const data = await api.get<CustomDbItem[]>(`/custom-databases/${dbId}/items`);
      setItems(data);
    } catch (e) {
      console.error('Failed to load database items:', e);
    } finally {
      setItemsLoading(false);
    }
  };

  useEffect(() => {
    if (activeDbId) {
      fetchItems(activeDbId);
    } else {
      setItems([]);
    }
  }, [activeDbId]);

  // Aggregate all tags for suggestions
  const tagSuggestionsByColumn = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (!activeDb) return map;

    for (const col of activeDb.columns) {
      if (col.type === 'tags' || col.key === 'projects' || col.key === 'transgenes' || col.key === 'applications') {
        const set = new Set<string>();
        for (const item of items) {
          const val = item.data[col.key];
          if (Array.isArray(val)) {
            val.forEach(v => v && set.add(String(v).trim()));
          } else if (typeof val === 'string' && val.trim()) {
            val.split(',').forEach(v => v && set.add(v.trim()));
          }
        }
        map[col.key] = Array.from(set);
      }
    }
    return map;
  }, [activeDb, items]);

  // Handle template selection in Create DB Modal
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId === 'custom') {
      setNewDbName('');
      setNewDbDesc('');
      setNewDbCategory('general');
      setNewDbColumns([
        { key: 'title', name: t('common.name', '名前/タイトル'), type: 'text', required: true },
        { key: 'notes', name: t('common.notes', '備考'), type: 'textarea' }
      ]);
      return;
    }

    const tpl = PRESET_TEMPLATES.find(t => t.id === templateId);
    if (tpl) {
      setNewDbName(t(`customDatabases.presets.${tpl.id}.name`, tpl.name));
      setNewDbDesc(t(`customDatabases.presets.${tpl.id}.description`, tpl.description));
      setNewDbCategory(tpl.category);
      setNewDbColumns(tpl.columns.map(col => {
        const camelKey = col.key.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
        const locName = t(`customDatabases.presets.${tpl.id}.${camelKey}`, col.name);
        const locHint = col.hint ? t(`customDatabases.presets.${tpl.id}.${camelKey}Hint`, col.hint) : col.hint;
        return {
          ...col,
          name: locName,
          hint: locHint
        };
      }));
    }
  };

  // Open Create DB Modal
  const handleOpenCreateDb = (presetId: string = 'primers') => {
    handleSelectTemplate(presetId);
    setShowCreateDbModal(true);
  };

  // Submit Create DB
  const handleCreateDatabase = async () => {
    if (!newDbName.trim()) {
      alert(t('customDatabases.nameRequired', 'データベース名を入力してください'));
      return;
    }
    if (newDbColumns.length === 0) {
      alert(t('customDatabases.columnsRequired', '少なくとも1つ以上の項目（カラム）が必要です'));
      return;
    }

    try {
      const created = await api.post<CustomDb>('/custom-databases', {
        name: newDbName.trim(),
        description: newDbDesc.trim(),
        category: newDbCategory,
        columns: newDbColumns
      });

      setDatabases(prev => [...prev, created]);
      setActiveDbId(created.id);
      setShowCreateDbModal(false);
    } catch (e: any) {
      alert(t('customDatabases.createFailed', { message: e.message }));
    }
  };

  // Delete DB
  const handleDeleteDatabase = async (dbId: number, dbName: string) => {
    if (!confirm(t('customDatabases.confirmDeleteDb', { name: dbName }))) return;
    try {
      await api.delete(`/custom-databases/${dbId}`);
      setDatabases(prev => prev.filter(d => d.id !== dbId));
      if (activeDbId === dbId) {
        const remaining = databases.filter(d => d.id !== dbId);
        setActiveDbId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (e: any) {
      alert(t('customDatabases.deleteFailed', { message: e.message }));
    }
  };

  // Open Add/Edit Item Modal
  const handleOpenItemModal = (item?: CustomDbItem) => {
    if (item) {
      setEditingItem(item);
      setItemFormData({ ...item.data });
    } else {
      setEditingItem(null);
      const defaults: Record<string, any> = {};
      activeDb?.columns.forEach(c => {
        if (c.type === 'checkbox') defaults[c.key] = false;
        else if (c.type === 'tags') defaults[c.key] = [];
        else if (c.type === 'select' && c.options && c.options.length > 0) defaults[c.key] = c.options[0];
        else defaults[c.key] = '';
      });
      setItemFormData(defaults);
    }
    setShowItemModal(true);
  };

  // Handle Sequence Change with Auto-Calculation of Length & Tm
  const handleSequenceChange = (colKey: string, seqVal: string) => {
    const clean = cleanDnaSequence(seqVal);
    const len = calcSequenceLength(clean);
    const tm = calcTmValue(clean);

    const updated = {
      ...itemFormData,
      [colKey]: seqVal,
    };

    // Auto-fill length and tm if those columns exist in activeDb
    if (activeDb?.columns.some(c => c.key === 'length')) {
      updated.length = len;
    }
    if (activeDb?.columns.some(c => c.key === 'tm')) {
      updated.tm = tm;
    }

    setItemFormData(updated);
  };

  // Save Item
  const handleSaveItem = async () => {
    if (!activeDbId || !activeDb) return;

    // Validation
    for (const col of activeDb.columns) {
      if (col.required && !col.computed) {
        const val = itemFormData[col.key];
        if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
          alert(t('customDatabases.fieldRequired', { name: col.name }));
          return;
        }
      }
    }

    try {
      if (editingItem) {
        const updated = await api.put<CustomDbItem>(`/custom-databases/${activeDbId}/items/${editingItem.id}`, {
          data: itemFormData
        });
        setItems(prev => prev.map(it => it.id === editingItem.id ? updated : it));
      } else {
        const created = await api.post<CustomDbItem>(`/custom-databases/${activeDbId}/items`, {
          data: itemFormData
        });
        setItems(prev => [created, ...prev]);
        // Update item count in database list
        setDatabases(prev => prev.map(d => d.id === activeDbId ? { ...d, item_count: (d.item_count || 0) + 1 } : d));
      }
      setShowItemModal(false);
    } catch (e: any) {
      alert(t('customDatabases.saveFailed', { message: e.message }));
    }
  };

  // Delete Item
  const handleDeleteItem = async (itemId: number) => {
    if (!activeDbId || !confirm(t('customDatabases.confirmDeleteItem', 'このデータを削除してもよろしいですか？'))) return;
    try {
      await api.delete(`/custom-databases/${activeDbId}/items/${itemId}`);
      setItems(prev => prev.filter(it => it.id !== itemId));
      setDatabases(prev => prev.map(d => d.id === activeDbId ? { ...d, item_count: Math.max(0, (d.item_count || 1) - 1) } : d));
    } catch (e: any) {
      alert(t('customDatabases.deleteFailed', { message: e.message }));
    }
  };

  // Filtered items by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(it => {
      return Object.values(it.data).some(val => {
        if (val === null || val === undefined) return false;
        if (Array.isArray(val)) return val.some(v => String(v).toLowerCase().includes(q));
        return String(val).toLowerCase().includes(q);
      });
    });
  }, [items, searchQuery]);

  // CSV Export
  const handleExportCsv = () => {
    if (!activeDb || items.length === 0) return;
    const headers = activeDb.columns.map(c => `"${localizeColumnName(c, activeDb).replace(/"/g, '""')}"`);
    const rows = items.map(item => {
      return activeDb.columns.map(c => {
        let val = item.data[c.key];
        if (Array.isArray(val)) val = val.map(v => localizeOptionValue(String(v))).join(', ');
        else if (val === null || val === undefined) val = '';
        else if (typeof val === 'boolean') val = val ? t('common.yes', 'はい') : t('common.no', 'いいえ');
        else if (c.type === 'select') val = localizeOptionValue(String(val));
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${localizeDbName(activeDb)}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Work Status Badge Renderer
  const renderWorkBadge = (val: string) => {
    if (!val) return <span className="text-gray-500 text-xs">-</span>;
    if (val.includes('良好') || val.includes('Worked')) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">{t('customDatabases.workStatus.worked', '良好 (Worked)')}</span>;
    }
    if (val.includes('微弱') || val.includes('Weak')) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">{t('customDatabases.workStatus.weak', '微弱 (Weak)')}</span>;
    }
    if (val.includes('機能せず') || val.includes('Failed')) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30">{t('customDatabases.workStatus.failed', '機能せず (Failed)')}</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-500/20 text-gray-300 border border-gray-500/30">{t('customDatabases.workStatus.untested', '未確認')}</span>;
  };

  // Helper Icon for Template
  const getDbIcon = (category: string) => {
    if (category === 'oligo') return <Dna className="w-4 h-4 text-cyan-400" />;
    if (category === 'sample') return <FlaskConical className="w-4 h-4 text-emerald-400" />;
    if (category === 'antibody') return <Shield className="w-4 h-4 text-pink-400" />;
    return <DatabaseIcon className="w-4 h-4 text-indigo-400" />;
  };

  return (
    <div className="bg-[#161b22] border border-white/10 rounded-xl overflow-hidden flex flex-col shadow-lg">
      {/* ─── Top Header & Database Tab Switcher ─── */}
      <div className="p-4 border-b border-white/10 bg-white/[0.02] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <DatabaseIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-gray-100 flex items-center gap-2 text-base">
              {t('customDatabases.title', 'サンプル・プライマー・リソース データベース')}
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-400">
                {t('customDatabases.dbCount', { count: databases.length })}
              </span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {t('customDatabases.subtitle', '形質転換体、オリゴ/プライマー、抗体などのリソース情報を実験ノートと連携して一元管理')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenCreateDb('primers')}
            className="btn btn-primary btn-sm flex items-center gap-1.5 text-xs py-1.5 px-3 shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>{t('customDatabases.createDb', 'データベースを作成')}</span>
          </button>
        </div>
      </div>

      {/* ─── Databases Tabs Bar ─── */}
      {databases.length > 0 ? (
        <div className="px-4 pt-3 border-b border-white/10 bg-[#0d1117] flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-2">
            {databases.map(db => {
              const isActive = db.id === activeDbId;
              return (
                <div
                  key={db.id}
                  onClick={() => setActiveDbId(db.id)}
                  className={`group flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all whitespace-nowrap border ${
                    isActive
                      ? 'bg-indigo-600/20 text-indigo-200 border-indigo-500/50 shadow-sm'
                      : 'bg-white/5 text-gray-400 border-transparent hover:bg-white/10 hover:text-gray-200'
                  }`}
                >
                  {getDbIcon(db.category)}
                  <span>{localizeDbName(db)}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-indigo-500/40 text-white' : 'bg-white/10 text-gray-400'}`}>
                    {db.item_count || 0}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteDatabase(db.id, localizeDbName(db));
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 rounded transition-opacity"
                    title={t('customDatabases.deleteDb', 'データベースを削除')}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => handleOpenCreateDb('custom')}
            className="text-xs text-gray-400 hover:text-indigo-300 pb-2 flex items-center gap-1 shrink-0 px-2"
            title={t('customDatabases.createDbTitle', '新規データベース定義')}
          >
            <Plus className="w-3.5 h-3.5" /> {t('common.add', '追加')}
          </button>
        </div>
      ) : (
        /* Empty State with Quick Template Starters */
        <div className="p-8 text-center bg-white/[0.01]">
          <DatabaseIcon className="w-12 h-12 text-gray-500 mx-auto mb-3 opacity-30" />
          <h4 className="text-sm font-semibold text-gray-300">{t('customDatabases.noDatabases', 'データベースがまだ作成されていません')}</h4>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            {t('customDatabases.noDatabasesDesc', 'プライマーや形質転換体、抗体などを項目別に整理して管理できます。以下のテンプレートからすぐに始められます：')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
            {PRESET_TEMPLATES.map(tpl => {
              const Icon = tpl.icon;
              return (
                <button
                  key={tpl.id}
                  onClick={() => handleOpenCreateDb(tpl.id)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/5 border border-white/10 hover:border-indigo-500/50 hover:bg-white/10 text-xs text-gray-200 transition-all shadow-sm"
                >
                  <Icon className="w-4 h-4" style={{ color: tpl.color }} />
                  <span className="font-medium">{t(`customDatabases.presets.${tpl.id}.name`, tpl.name)}</span>
                  <Plus className="w-3.5 h-3.5 text-gray-400" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Active Database Content ─── */}
      {activeDb && (
        <div className="p-4 flex flex-col gap-3">
          {/* Active Database Header / Description */}
          {localizeDbDesc(activeDb) && (
            <div className="flex items-center gap-2 text-xs bg-white/[0.02] px-3 py-2 rounded-lg border border-white/5">
              <span className="text-gray-200 font-semibold">{localizeDbName(activeDb)}:</span>
              <span className="text-gray-400">{localizeDbDesc(activeDb)}</span>
            </div>
          )}

          {/* Table Toolbar: Search, Add Item, Export */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={t('customDatabases.searchPlaceholder', { name: localizeDbName(activeDb) })}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCsv}
                disabled={items.length === 0}
                className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs py-1.5 px-3 disabled:opacity-40"
                title={t('customDatabases.exportCsv', 'CSVエクスポート')}
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t('customDatabases.exportCsv', 'CSVエクスポート')}</span>
              </button>

              <button
                onClick={() => handleOpenItemModal()}
                className="btn btn-primary btn-sm flex items-center gap-1.5 text-xs py-1.5 px-3 shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>{t('customDatabases.addData', '新規データを追加')}</span>
              </button>
            </div>
          </div>

          {/* Database Items Table */}
          <div className="border border-white/10 rounded-lg overflow-x-auto max-h-[420px] custom-scrollbar bg-[#0d1117]">
            <table className="w-full text-left text-xs text-gray-200 border-collapse">
              <thead className="sticky top-0 bg-[#161b22] border-b border-white/15 z-10">
                <tr>
                  <th className="py-2.5 px-3 font-semibold text-gray-400 w-12 text-center">#</th>
                  {activeDb.columns.map(col => (
                    <th key={col.key} className="py-2.5 px-3 font-semibold text-gray-300 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span>{localizeColumnName(col, activeDb)}</span>
                        {col.computed && <span className="text-[9px] px-1 bg-indigo-500/30 text-indigo-300 rounded">{t('customDatabases.auto', '自動')}</span>}
                      </div>
                    </th>
                  ))}
                  <th className="py-2.5 px-3 font-semibold text-gray-400 text-right w-20">{t('common.actions', '操作')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {itemsLoading ? (
                  <tr>
                    <td colSpan={activeDb.columns.length + 2} className="py-8 text-center text-gray-500">
                      {t('customDatabases.loading', 'データを読み込み中...')}
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={activeDb.columns.length + 2} className="py-10 text-center text-gray-500">
                      {searchQuery ? t('customDatabases.noMatchingData', '検索条件に一致するデータがありません') : t('customDatabases.noData', 'データがまだ登録されていません。「新規データを追加」から登録してください。')}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, rowIdx) => (
                    <tr
                      key={item.id}
                      className="hover:bg-white/[0.03] transition-colors group cursor-pointer"
                      onClick={() => handleOpenItemModal(item)}
                    >
                      <td className="py-2 px-3 text-center text-gray-500 font-mono text-[11px]">
                        {rowIdx + 1}
                      </td>

                      {activeDb.columns.map(col => {
                        const val = item.data[col.key];

                        return (
                          <td key={col.key} className="py-2 px-3 whitespace-nowrap text-gray-300">
                            {/* Sequence formatting */}
                            {col.type === 'sequence' ? (
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[11px] text-cyan-300 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-500/20 max-w-[200px] truncate block" title={val}>
                                  {val || '-'}
                                </span>
                              </div>
                            ) : col.key === 'worked' ? (
                              renderWorkBadge(val)
                            ) : col.type === 'tags' || Array.isArray(val) ? (
                              <div className="flex flex-wrap gap-1 max-w-[240px]">
                                {(Array.isArray(val) ? val : String(val || '').split(',')).filter(Boolean).map((t, ti) => (
                                  <span key={ti} className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">
                                    {t.trim()}
                                  </span>
                                ))}
                              </div>
                            ) : col.type === 'checkbox' ? (
                              val ? (
                                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                                  <CheckSquare className="w-3.5 h-3.5" /> {t('customDatabases.done', '済')}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-gray-500">
                                  <Square className="w-3.5 h-3.5" /> {t('customDatabases.undone', '未')}
                                </span>
                              )
                            ) : col.key === 'tm' && val ? (
                              <span className="font-mono font-bold text-amber-300">{val} ℃</span>
                            ) : col.key === 'length' && val ? (
                              <span className="font-mono text-gray-400">{val} bp</span>
                            ) : col.type === 'textarea' ? (
                              <span className="truncate block max-w-[180px]" title={val}>{val || '-'}</span>
                            ) : (
                              <span>{val !== undefined && val !== null && val !== '' ? (col.type === 'select' ? localizeOptionValue(String(val)) : String(val)) : '-'}</span>
                            )}
                          </td>
                        );
                      })}

                      <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100">
                          <button
                            onClick={() => handleOpenItemModal(item)}
                            className="p-1 hover:text-indigo-400 hover:bg-white/10 rounded transition-colors"
                            title={t('common.edit', '編集')}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1 hover:text-red-400 hover:bg-white/10 rounded transition-colors"
                            title={t('common.delete', '削除')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: Create / Configure Database
      ════════════════════════════════════════════════════════════════════ */}
      {showCreateDbModal && (
        <div className="modal-overlay" onClick={() => setShowCreateDbModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <DatabaseIcon className="w-5 h-5 text-indigo-400" />
                <h3 className="modal-title font-bold text-base">{t('customDatabases.createDbTitle', '新しいデータベースを作成')}</h3>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowCreateDbModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="modal-body flex flex-col gap-4 max-h-[70vh] overflow-y-auto custom-scrollbar p-5">
              {/* Template Picker */}
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-2">{t('customDatabases.selectFromTemplate', 'テンプレートから選択:')}</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {PRESET_TEMPLATES.map(tpl => {
                    const Icon = tpl.icon;
                    const isSel = selectedTemplateId === tpl.id;
                    return (
                      <div
                        key={tpl.id}
                        onClick={() => handleSelectTemplate(tpl.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between gap-1.5 ${
                          isSel
                            ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon className="w-4 h-4" style={{ color: tpl.color }} />
                          <span className="font-semibold text-xs text-gray-100">{t(`customDatabases.presets.${tpl.id}.name`, tpl.name)}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 line-clamp-2">{t(`customDatabases.presets.${tpl.id}.description`, tpl.description)}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => handleSelectTemplate('custom')}
                    className={`text-xs underline ${selectedTemplateId === 'custom' ? 'text-indigo-400 font-bold' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    {t('customDatabases.createEmptyCustomDb', 'テンプレートを使わず空のカスタムDBを作成する')}
                  </button>
                </div>
              </div>

              <div className="h-px bg-white/10" />

              {/* DB Name & Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-300 block mb-1">
                    {t('customDatabases.dbName', 'データベース名')} <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={newDbName}
                    onChange={(e) => setNewDbName(e.target.value)}
                    placeholder={t('customDatabases.dbNamePlaceholder', '例: プライマー/オリゴ管理')}
                    className="form-input text-xs w-full"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-300 block mb-1">{t('customDatabases.description', '説明 (任意)')}</label>
                  <input
                    type="text"
                    value={newDbDesc}
                    onChange={(e) => setNewDbDesc(e.target.value)}
                    placeholder={t('customDatabases.descriptionPlaceholder', '例: プロジェクトA用のプライマー一覧')}
                    className="form-input text-xs w-full"
                  />
                </div>
              </div>

              {/* Column Definitions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                    {t('customDatabases.columnDefinitions', '項目 (カラム) 定義:')}
                    <span className="text-[11px] text-gray-500 font-normal">{t('customDatabases.columnsCount', { count: newDbColumns.length })}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const newKey = `col_${Date.now()}`;
                      setNewDbColumns([...newDbColumns, { key: newKey, name: t('customDatabases.newColumn', '新規項目'), type: 'text' }]);
                    }}
                    className="btn btn-ghost btn-sm text-xs py-1 px-2 text-indigo-400 hover:text-indigo-300"
                  >
                    <Plus className="w-3.5 h-3.5" /> {t('customDatabases.addColumn', '項目を追加')}
                  </button>
                </div>

                <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar p-1">
                  {newDbColumns.map((col, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-white/5 border border-white/10 rounded-lg text-xs">
                      <span className="text-gray-500 font-mono text-[10px] w-5 text-center">{idx + 1}</span>
                      <input
                        type="text"
                        value={col.name}
                        onChange={(e) => {
                          const updated = [...newDbColumns];
                          updated[idx].name = e.target.value;
                          setNewDbColumns(updated);
                        }}
                        placeholder={t('customDatabases.columnNamePlaceholder', '項目名')}
                        className="form-input text-xs py-1 px-2 flex-1"
                      />
                      <select
                        value={col.type}
                        onChange={(e) => {
                          const updated = [...newDbColumns];
                          updated[idx].type = e.target.value as any;
                          setNewDbColumns(updated);
                        }}
                        className="form-select text-xs py-1 px-2 w-28 bg-[#1a1f2e]"
                      >
                        <option value="text">{t('customDatabases.colTypes.text', '1行テキスト')}</option>
                        <option value="sequence">{t('customDatabases.colTypes.sequence', '塩基配列(DNA/RNA)')}</option>
                        <option value="number">{t('customDatabases.colTypes.number', '数値')}</option>
                        <option value="select">{t('customDatabases.colTypes.select', '選択肢')}</option>
                        <option value="tags">{t('customDatabases.colTypes.tags', 'タグ(複数)')}</option>
                        <option value="date">{t('customDatabases.colTypes.date', '日付')}</option>
                        <option value="checkbox">{t('customDatabases.colTypes.checkbox', 'チェック(有無)')}</option>
                        <option value="textarea">{t('customDatabases.colTypes.textarea', '複数行テキスト')}</option>
                      </select>

                      {col.type === 'select' && (
                        <input
                          type="text"
                          value={(col.options || []).join(', ')}
                          onChange={(e) => {
                            const updated = [...newDbColumns];
                            updated[idx].options = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                            setNewDbColumns(updated);
                          }}
                          placeholder={t('customDatabases.selectOptionsPlaceholder', '選択肢 (カンマ区切り: A, B, C)')}
                          className="form-input text-xs py-1 px-2 flex-1"
                          title={t('customDatabases.selectOptionsTooltip', '選択肢をカンマ区切りで入力してください')}
                        />
                      )}

                      <label className="flex items-center gap-1 text-[11px] text-gray-400 cursor-pointer whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={col.required || false}
                          onChange={(e) => {
                            const updated = [...newDbColumns];
                            updated[idx].required = e.target.checked;
                            setNewDbColumns(updated);
                          }}
                        />
                        {t('customDatabases.required', '必須')}
                      </label>

                      <button
                        type="button"
                        onClick={() => setNewDbColumns(newDbColumns.filter((_, i) => i !== idx))}
                        className="p-1 text-gray-500 hover:text-red-400 rounded"
                        title={t('customDatabases.deleteColumn', '項目を削除')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCreateDbModal(false)}>
                {t('common.cancel', 'キャンセル')}
              </button>
              <button type="button" className="btn btn-primary btn-sm px-4" onClick={handleCreateDatabase}>
                {t('customDatabases.createDb', 'データベースを作成')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: Add / Edit Data Item
      ════════════════════════════════════════════════════════════════════ */}
      {showItemModal && activeDb && (
        <div className="modal-overlay" onClick={() => setShowItemModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div className="flex items-center gap-2">
                {getDbIcon(activeDb.category)}
                <h3 className="modal-title font-bold text-base">
                  {editingItem ? t('customDatabases.editData', 'データを編集') : t('customDatabases.addData', '新規データを追加')}
                  <span className="text-xs font-normal text-gray-400 ml-2">({localizeDbName(activeDb)})</span>
                </h3>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowItemModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="modal-body flex flex-col gap-3.5 max-h-[72vh] overflow-y-auto custom-scrollbar p-5">
              {activeDb.columns.map(col => {
                const val = itemFormData[col.key];

                // ─── Sequence Input with Live Preview of Length & Tm ───
                if (col.type === 'sequence') {
                  const clean = cleanDnaSequence(val || '');
                  const len = calcSequenceLength(clean);
                  const tm = calcTmValue(clean);

                  return (
                    <div key={col.key} className="space-y-1.5 p-3 rounded-lg bg-cyan-950/20 border border-cyan-500/20">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                          <Dna className="w-3.5 h-3.5" />
                          <span>{localizeColumnName(col, activeDb)}</span>
                          {col.required && <span className="text-red-400">*</span>}
                        </label>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono font-semibold">
                            {t('customDatabases.sequenceLength', { len })}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-semibold">
                            {t('customDatabases.sequenceTm', { tm })}
                          </span>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={val || ''}
                        onChange={(e) => handleSequenceChange(col.key, e.target.value)}
                        placeholder={t('customDatabases.exampleSequence', '例: ATGCGATCGATC...')}
                        className="form-input font-mono text-xs w-full uppercase"
                      />
                      <p className="text-[10px] text-gray-400">
                        {t('customDatabases.sequenceNotice', '※ 配列を入力すると、塩基長(bp)およびTm値(℃)がリアルタイムに自動計算されます。')}
                      </p>
                    </div>
                  );
                }

                // ─── Tags Input (Projects, Transgenes, Applications, etc.) ───
                if (col.type === 'tags') {
                  const suggestions = tagSuggestionsByColumn[col.key] || [];
                  return (
                    <div key={col.key}>
                      <label className="text-xs font-semibold text-gray-300 block mb-1">
                        {localizeColumnName(col, activeDb)} {col.required && <span className="text-red-400">*</span>}
                        {col.hint && <span className="text-[10px] text-gray-400 ml-1.5 font-normal">({localizeColumnHint(col, activeDb)})</span>}
                      </label>
                      <TagInput
                        value={Array.isArray(val) ? val : []}
                        onChange={(newTags) => setItemFormData({ ...itemFormData, [col.key]: newTags })}
                        allSuggestions={suggestions}
                        placeholder={t('customDatabases.tagInputPlaceholder', 'タグを入力してEnter (過去の入力からサジェスト)')}
                      />
                    </div>
                  );
                }

                // ─── Select Dropdown ───
                if (col.type === 'select') {
                  return (
                    <div key={col.key}>
                      <label className="text-xs font-semibold text-gray-300 block mb-1">
                        {localizeColumnName(col, activeDb)} {col.required && <span className="text-red-400">*</span>}
                      </label>
                      <select
                        value={val || (col.options?.[0] || '')}
                        onChange={(e) => setItemFormData({ ...itemFormData, [col.key]: e.target.value })}
                        className="form-select text-xs w-full bg-[#1a1f2e]"
                      >
                        {(col.options || []).map((opt, oi) => (
                          <option key={oi} value={opt}>{localizeOptionValue(opt)}</option>
                        ))}
                      </select>
                    </div>
                  );
                }

                // ─── Checkbox ───
                if (col.type === 'checkbox') {
                  return (
                    <div key={col.key} className="flex items-center gap-2 pt-1">
                      <label className="flex items-center gap-2 text-xs font-semibold text-gray-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(val)}
                          onChange={(e) => setItemFormData({ ...itemFormData, [col.key]: e.target.checked })}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{localizeColumnName(col, activeDb)}</span>
                      </label>
                    </div>
                  );
                }

                // ─── Date Picker ───
                if (col.type === 'date') {
                  return (
                    <div key={col.key}>
                      <label className="text-xs font-semibold text-gray-300 block mb-1">
                        {localizeColumnName(col, activeDb)} {col.required && <span className="text-red-400">*</span>}
                      </label>
                      <input
                        type="date"
                        value={val || ''}
                        onChange={(e) => setItemFormData({ ...itemFormData, [col.key]: e.target.value })}
                        className="form-input text-xs w-full"
                      />
                    </div>
                  );
                }

                // ─── Textarea ───
                if (col.type === 'textarea') {
                  return (
                    <div key={col.key}>
                      <label className="text-xs font-semibold text-gray-300 block mb-1">
                        {localizeColumnName(col, activeDb)} {col.required && <span className="text-red-400">*</span>}
                      </label>
                      <textarea
                        rows={2}
                        value={val || ''}
                        onChange={(e) => setItemFormData({ ...itemFormData, [col.key]: e.target.value })}
                        placeholder={localizeColumnHint(col, activeDb) || ''}
                        className="form-textarea text-xs w-full"
                      />
                    </div>
                  );
                }

                // ─── Number / Standard Text ───
                return (
                  <div key={col.key}>
                    <label className="text-xs font-semibold text-gray-300 block mb-1">
                      {localizeColumnName(col, activeDb)} {col.required && <span className="text-red-400">*</span>}
                      {col.computed && <span className="text-[10px] text-indigo-400 ml-1.5 font-normal">{t('customDatabases.computedFromSequence', '(配列から自動計算)')}</span>}
                    </label>
                    <input
                      type={col.type === 'number' ? 'number' : 'text'}
                      step={col.type === 'number' ? 'any' : undefined}
                      value={val !== undefined ? val : ''}
                      onChange={(e) => setItemFormData({ ...itemFormData, [col.key]: col.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value })}
                      placeholder={localizeColumnHint(col, activeDb) || ''}
                      className="form-input text-xs w-full"
                    />
                  </div>
                );
              })}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowItemModal(false)}>
                {t('common.cancel', 'キャンセル')}
              </button>
              <button type="button" className="btn btn-primary btn-sm px-4" onClick={handleSaveItem}>
                {t('common.save', '保存')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
