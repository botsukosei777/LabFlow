-- ========================================
-- 6. Shared SubProtocols
-- ========================================
CREATE TABLE IF NOT EXISTS public.shared_sub_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT DEFAULT '',
  shared_by UUID REFERENCES auth.users(id),
  original_local_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for Shared SubProtocols
ALTER TABLE public.shared_sub_protocols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view shared sub protocols"
ON public.shared_sub_protocols FOR SELECT
USING (public.is_team_member(team_id));

CREATE POLICY "Members can insert shared sub protocols"
ON public.shared_sub_protocols FOR INSERT
WITH CHECK (public.is_team_member(team_id));

CREATE POLICY "Owner/admin or sharer can update sub protocols"
ON public.shared_sub_protocols FOR UPDATE
USING (
  shared_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_id = shared_sub_protocols.team_id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "Owner/admin or sharer can delete sub protocols"
ON public.shared_sub_protocols FOR DELETE
USING (
  shared_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_id = shared_sub_protocols.team_id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Add sub_protocol columns to shared_steps if they don't exist
ALTER TABLE public.shared_steps ADD COLUMN IF NOT EXISTS sub_protocol TEXT DEFAULT '';
ALTER TABLE public.shared_steps ADD COLUMN IF NOT EXISTS sub_protocol_id UUID REFERENCES public.shared_sub_protocols(id) ON DELETE SET NULL;
