// Experiment Types
export interface ExperimentType {
  id: number;
  name: string;
  description: string;
  color: string;
  created_at: string;
  updated_at: string;
  steps_count?: number;
  blocks_count?: number;
  protocols_count?: number;
}

export interface Step {
  id: number;
  experiment_type_id: number;
  pattern_label: string;
  name: string;
  description: string;
  duration_minutes: number;
  time_per_sample_minutes?: number;
  is_sample_dependent?: number;
  samples_per_batch?: number;
  is_overnight?: number;
  sub_protocol?: string;
  sub_protocol_id?: number | null;
  order_index: number;
  routine_name?: string | null;
  routine_duration_days?: number | null;
  routine_recurrence?: 'daily' | 'weekly' | 'weekdays' | 'custom' | null;
  routine_recurrence_days?: string | null;
  created_at?: string;
  preparations?: StepPreparation[];
}

export interface StepPreparation {
  id?: number;
  step_id?: number;
  message: string;
  timing_type: 'before_experiment' | 'after_step';
  timing_step_id: number | null;
  timing_offset_minutes: number;
  requires_check: boolean;
}

export interface Block {
  id: number;
  experiment_type_id: number;
  pattern_label: string;
  name: string;
  description: string;
  order_index: number;
  created_at: string;
  steps?: BlockStep[];
}

export interface BlockStep {
  id: number;
  block_id: number;
  step_id: number;
  order_index: number;
  delay_minutes: number;
  step?: Step;
}

export interface Protocol {
  id: number;
  experiment_type_id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  blocks?: ProtocolBlock[];
  has_sample_dependent_steps?: boolean;
  experiment_type?: ExperimentType;
}

export interface ProtocolBlock {
  id: number;
  protocol_id: number;
  block_id: number;
  day_offset: number;
  order_index: number;
  block?: Block;
}

// Schedule
export interface ScheduledExperiment {
  id: number;
  protocol_id: number;
  label: string;
  start_date: string;
  mode: 'management' | 'silent';
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  notes: string;
  sample_count?: number;
  created_at: string;
  updated_at: string;
  protocol?: Protocol;
  blocks?: ScheduledBlock[];
}

export interface ScheduledBlock {
  id: number;
  scheduled_experiment_id: number;
  protocol_block_id: number;
  scheduled_date: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completed_at: string | null;
  protocol_block?: ProtocolBlock;
  steps?: ScheduledStep[];
}

export interface ScheduledStep {
  id: number;
  scheduled_block_id: number;
  block_step_id: number;
  status: 'pending' | 'completed';
  completed_at: string | null;
  block_step?: BlockStep;
}

// Calendar Event (for react-big-calendar)
export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: {
    type: 'experiment' | 'holiday';
    experimentId?: number;
    blockId?: number;
    color?: string;
    status?: string;
    mode?: string;
  };
}

// Milestones
export interface Milestone {
  id: number;
  name: string;
  description: string;
  deadline: string | null;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
  items?: MilestoneItem[];
}

export interface MilestoneItem {
  id: number;
  milestone_id: number;
  name: string;
  data_type: 'qualitative' | 'quantitative' | 'task';
  target_count: number;
  current_count: number;
  is_completed: boolean;
  order_index: number;
  created_at: string;
  sub_items?: MilestoneSubItem[];
}

export interface MilestoneSubItem {
  id: number;
  milestone_item_id: number;
  name: string;
  data_type: 'qualitative' | 'quantitative' | 'task';
  target_count: number;
  current_count: number;
  is_completed: boolean;
  order_index: number;
}

export interface SubProtocol {
  id: number;
  user_id: number;
  name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

// Reagents / Inventory
export interface Reagent {
  id: number;
  name: string;
  description: string;
  category: string;
  quantity_trackable: boolean;
  current_quantity: number;
  min_quantity: number;
  unit: string;
  is_depleted: boolean;
  supplier: string;
  catalog_number: string;
  location?: string;
  shared_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ExperimentReagent {
  id: number;
  experiment_type_id: number;
  reagent_id: number;
  quantity_per_experiment: number;
  reagent?: Reagent;
  experiment_type?: ExperimentType;
}

// Routines
export interface RoutineTask {
  id: number;
  user_id: number;
  name: string;
  description: string;
  recurrence: 'daily' | 'weekly' | 'weekdays' | 'custom';
  recurrence_days: string;
  is_active: number;
  start_date?: string;
  end_date?: string;
  created_at: string;
  completed_today?: boolean;
}

export interface RoutineCompletion {
  id: number;
  routine_task_id: number;
  date: string;
  completed_at: string;
}

// Settings
export interface AppSettings {
  smtp_preset: 'gmail' | 'outlook' | 'university' | 'custom';
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_secure: string;
  notification_email: string;
  language: 'ja' | 'en';
  daily_email_time: string;
  reminder_email_time: string;
  timezone: string;
}

// Holidays
export interface Holiday {
  id: number;
  date: string;
  label: string;
  recurring: boolean;
  created_at: string;
}

export interface MiniMemo {
  id: number;
  message: string;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

// API Response
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

// Toast
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

// Polls
export interface PollOption {
  id: number;
  poll_id: number;
  text: string;
  order_index: number;
}

export interface PollVote {
  id: number;
  poll_id: number;
  user_id: number;
  voter_name: string;
  answers: Record<string, any>; // e.g. {"2026-08-15": {"09:00": "◎"}}
  created_at: string;
  updated_at: string;
}

export interface Poll {
  id: number;
  user_id: number;
  title: string;
  description?: string;
  type: 'survey' | 'schedule';
  status: 'open' | 'closed';
  deadline?: string;
  settings: any;
  shared_id?: string;
  created_at: string;
  updated_at: string;
  options?: PollOption[];
  votes?: PollVote[];
}
