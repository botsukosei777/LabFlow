-- Add original_local_id to track the source of shared milestones for synchronization
ALTER TABLE public.shared_milestones ADD COLUMN original_local_id INTEGER;

-- Create an index to quickly find shared milestones by their local source
CREATE INDEX IF NOT EXISTS idx_shared_milestones_local_id ON public.shared_milestones(original_local_id);
