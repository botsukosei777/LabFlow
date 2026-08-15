-- Add routine generation fields to shared_steps
ALTER TABLE public.shared_steps 
ADD COLUMN IF NOT EXISTS routine_name TEXT,
ADD COLUMN IF NOT EXISTS routine_duration_days INTEGER,
ADD COLUMN IF NOT EXISTS routine_recurrence TEXT,
ADD COLUMN IF NOT EXISTS routine_recurrence_days TEXT;
