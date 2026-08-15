-- Add missing columns to shared_reagents to match local db
ALTER TABLE public.shared_reagents 
ADD COLUMN IF NOT EXISTS original_local_id INTEGER,
ADD COLUMN IF NOT EXISTS quantity_trackable BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_depleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS supplier TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS catalog_number TEXT DEFAULT '';

-- We also add a column to track last synced timestamp so we know which side is newer during a 2-way sync
ALTER TABLE public.shared_reagents 
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ DEFAULT now();
