-- ========================================
-- 11. Shared Literature & Shared Documents
-- ========================================

-- ─── 1. Shared Literature ───
CREATE TABLE IF NOT EXISTS public.shared_literature (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  authors TEXT DEFAULT '',
  lab_name TEXT DEFAULT '',
  journal TEXT DEFAULT '',
  volume TEXT DEFAULT '',
  issue TEXT DEFAULT '',
  pages TEXT DEFAULT '',
  year INTEGER,
  doi TEXT DEFAULT '',
  pmid TEXT DEFAULT '',
  url TEXT DEFAULT '',
  paper_type TEXT DEFAULT 'original',
  project_name TEXT DEFAULT '',
  abstract TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  keywords JSONB DEFAULT '[]'::jsonb,
  rating INTEGER DEFAULT 0,
  shared_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  original_local_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for Shared Literature
ALTER TABLE public.shared_literature ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view shared literature"
ON public.shared_literature FOR SELECT
USING (public.is_team_member(team_id));

CREATE POLICY "Members can insert shared literature"
ON public.shared_literature FOR INSERT
WITH CHECK (public.is_team_member(team_id));

CREATE POLICY "Owner/admin or sharer can update shared literature"
ON public.shared_literature FOR UPDATE
USING (
  shared_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_id = shared_literature.team_id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "Owner/admin or sharer can delete shared literature"
ON public.shared_literature FOR DELETE
USING (
  shared_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_id = shared_literature.team_id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- ─── 2. Shared Documents (Research Documents) ───
CREATE TABLE IF NOT EXISTS public.shared_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  tags JSONB DEFAULT '[]'::jsonb,
  linked_shared_experiment_type_ids JSONB DEFAULT '[]'::jsonb,
  linked_shared_literature_ids JSONB DEFAULT '[]'::jsonb,
  shared_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  original_local_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.shared_documents ADD COLUMN IF NOT EXISTS linked_shared_experiment_type_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.shared_documents ADD COLUMN IF NOT EXISTS linked_shared_literature_ids JSONB DEFAULT '[]'::jsonb;

-- Permissions
GRANT ALL ON public.shared_literature TO anon, authenticated, service_role;
GRANT ALL ON public.shared_documents TO anon, authenticated, service_role;

-- RLS for Shared Documents
ALTER TABLE public.shared_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view shared documents"
ON public.shared_documents FOR SELECT
USING (public.is_team_member(team_id));

CREATE POLICY "Members can insert shared documents"
ON public.shared_documents FOR INSERT
WITH CHECK (public.is_team_member(team_id));

CREATE POLICY "Owner/admin or sharer can update shared documents"
ON public.shared_documents FOR UPDATE
USING (
  shared_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_id = shared_documents.team_id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "Owner/admin or sharer can delete shared documents"
ON public.shared_documents FOR DELETE
USING (
  shared_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_id = shared_documents.team_id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);
