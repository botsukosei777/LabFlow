-- ========================================
-- LabFlow Team Polls Schema
-- ========================================

CREATE TABLE IF NOT EXISTS public.shared_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  original_local_id INTEGER,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT NOT NULL, -- 'survey' or 'schedule'
  status TEXT NOT NULL DEFAULT 'open', -- 'open' or 'closed'
  deadline TIMESTAMPTZ,
  settings JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shared_poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.shared_polls(id) ON DELETE CASCADE,
  original_local_id INTEGER,
  text TEXT NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shared_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.shared_polls(id) ON DELETE CASCADE,
  original_local_id INTEGER,
  user_id UUID REFERENCES auth.users(id),
  voter_name TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.shared_polls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view polls" ON public.shared_polls FOR SELECT USING (public.is_team_member(team_id));
CREATE POLICY "Team members can insert polls" ON public.shared_polls FOR INSERT WITH CHECK (public.is_team_member(team_id));
CREATE POLICY "Team members can update polls" ON public.shared_polls FOR UPDATE USING (public.is_team_member(team_id));
CREATE POLICY "Team members can delete polls" ON public.shared_polls FOR DELETE USING (public.is_team_member(team_id));

ALTER TABLE public.shared_poll_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view options" ON public.shared_poll_options FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.shared_polls p WHERE p.id = shared_poll_options.poll_id AND public.is_team_member(p.team_id))
);
CREATE POLICY "Team members can insert options" ON public.shared_poll_options FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.shared_polls p WHERE p.id = shared_poll_options.poll_id AND public.is_team_member(p.team_id))
);
CREATE POLICY "Team members can update options" ON public.shared_poll_options FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.shared_polls p WHERE p.id = shared_poll_options.poll_id AND public.is_team_member(p.team_id))
);
CREATE POLICY "Team members can delete options" ON public.shared_poll_options FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.shared_polls p WHERE p.id = shared_poll_options.poll_id AND public.is_team_member(p.team_id))
);

ALTER TABLE public.shared_poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view votes" ON public.shared_poll_votes FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.shared_polls p WHERE p.id = shared_poll_votes.poll_id AND public.is_team_member(p.team_id))
);
CREATE POLICY "Team members can insert votes" ON public.shared_poll_votes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.shared_polls p WHERE p.id = shared_poll_votes.poll_id AND public.is_team_member(p.team_id))
);
CREATE POLICY "Team members can update votes" ON public.shared_poll_votes FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.shared_polls p WHERE p.id = shared_poll_votes.poll_id AND public.is_team_member(p.team_id))
);
CREATE POLICY "Team members can delete votes" ON public.shared_poll_votes FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.shared_polls p WHERE p.id = shared_poll_votes.poll_id AND public.is_team_member(p.team_id))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shared_polls_team ON public.shared_polls(team_id);
CREATE INDEX IF NOT EXISTS idx_shared_poll_options_poll ON public.shared_poll_options(poll_id);
CREATE INDEX IF NOT EXISTS idx_shared_poll_votes_poll ON public.shared_poll_votes(poll_id);
