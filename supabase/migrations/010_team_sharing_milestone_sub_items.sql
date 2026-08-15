CREATE TABLE IF NOT EXISTS public.shared_milestone_sub_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  milestone_item_id UUID NOT NULL REFERENCES public.shared_milestone_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'qualitative',
  target_count INTEGER DEFAULT 1,
  current_count INTEGER DEFAULT 0,
  unit TEXT DEFAULT '',
  is_completed BOOLEAN NOT NULL DEFAULT false,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.shared_milestone_sub_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team access via milestone item" ON public.shared_milestone_sub_items FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.shared_milestone_items i
    JOIN public.shared_milestones m ON m.id = i.milestone_id
    WHERE i.id = shared_milestone_sub_items.milestone_item_id AND public.is_team_member(m.team_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.shared_milestone_items i
    JOIN public.shared_milestones m ON m.id = i.milestone_id
    WHERE i.id = shared_milestone_sub_items.milestone_item_id AND public.is_team_member(m.team_id)
  )
);

CREATE INDEX IF NOT EXISTS idx_shared_milestone_sub_items_item ON public.shared_milestone_sub_items(milestone_item_id);

GRANT ALL ON TABLE public.shared_milestone_sub_items TO anon, authenticated, service_role;
