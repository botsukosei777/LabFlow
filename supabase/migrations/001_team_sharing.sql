-- ========================================
-- LabFlow Team Sharing Schema
-- Supabase SQL Editor で実行してください
-- ========================================

-- ========================================
-- 1. Profiles (Supabase Auth連携)
-- ========================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles"
ON public.profiles FOR SELECT
USING (true);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

-- 自動プロフィール作成トリガー
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========================================
-- 2. Teams (チーム / 研究室)
-- ========================================
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  invite_code TEXT UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_members (
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'teacher')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Helper function
CREATE OR REPLACE FUNCTION public.is_team_member(check_team_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = check_team_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Members can view their teams"
ON public.teams FOR SELECT
USING (public.is_team_member(id));

CREATE POLICY "Anyone can create teams"
ON public.teams FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owner/admin can update teams"
ON public.teams FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.team_members 
  WHERE team_id = id AND user_id = auth.uid() AND role IN ('owner', 'admin')
));

CREATE POLICY "Owner can delete teams"
ON public.teams FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.team_members 
  WHERE team_id = id AND user_id = auth.uid() AND role = 'owner'
));

CREATE POLICY "Members can view team members"
ON public.team_members FOR SELECT
USING (public.is_team_member(team_id));

CREATE POLICY "Authenticated users can join teams"
ON public.team_members FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner/admin can manage members"
ON public.team_members FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.team_members tm 
  WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
));

CREATE POLICY "Owner/admin can remove members"
ON public.team_members FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.team_members tm 
  WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
));

-- ========================================
-- 3. Shared Experiment Types
-- ========================================
CREATE TABLE IF NOT EXISTS public.shared_experiment_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#6366F1',
  shared_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shared_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_type_id UUID NOT NULL REFERENCES public.shared_experiment_types(id) ON DELETE CASCADE,
  pattern_label TEXT DEFAULT 'default',
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  duration_minutes INTEGER DEFAULT 0,
  order_index INTEGER DEFAULT 0,
  is_overnight BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.shared_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_type_id UUID NOT NULL REFERENCES public.shared_experiment_types(id) ON DELETE CASCADE,
  pattern_label TEXT DEFAULT 'default',
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  order_index INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.shared_block_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL REFERENCES public.shared_blocks(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.shared_steps(id) ON DELETE CASCADE,
  order_index INTEGER DEFAULT 0,
  branch_index INTEGER DEFAULT 0
);

-- ========================================
-- 4. Shared Protocols
-- ========================================
CREATE TABLE IF NOT EXISTS public.shared_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  experiment_type_id UUID NOT NULL REFERENCES public.shared_experiment_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  shared_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shared_protocol_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID NOT NULL REFERENCES public.shared_protocols(id) ON DELETE CASCADE,
  block_id UUID NOT NULL REFERENCES public.shared_blocks(id) ON DELETE CASCADE,
  day_offset INTEGER DEFAULT 0,
  order_index INTEGER DEFAULT 0
);

-- ========================================
-- 5. Shared Milestones
-- ========================================
CREATE TABLE IF NOT EXISTS public.shared_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shared_milestone_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES public.shared_milestones(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data_type TEXT DEFAULT 'qualitative',
  target_count INTEGER DEFAULT 1,
  current_count INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  order_index INTEGER DEFAULT 0,
  unit TEXT DEFAULT ''
);

-- ========================================
-- 6. Shared Reagents / Inventory
-- ========================================
CREATE TABLE IF NOT EXISTS public.shared_reagents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT '',
  quantity REAL DEFAULT 0,
  unit TEXT DEFAULT '',
  min_quantity REAL DEFAULT 0,
  location TEXT DEFAULT '',
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ========================================
-- 7. Schedule Sharing (閲覧権限ベース)
-- ========================================
CREATE TABLE IF NOT EXISTS public.shared_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  protocol_name TEXT NOT NULL,
  experiment_type_name TEXT NOT NULL,
  label TEXT DEFAULT '',
  start_date DATE NOT NULL,
  end_date DATE,
  color TEXT DEFAULT '#6366F1',
  status TEXT DEFAULT 'scheduled',
  synced_at TIMESTAMPTZ DEFAULT now()
);

-- スケジュール閲覧権限テーブル
CREATE TABLE IF NOT EXISTS public.schedule_visibility (
  schedule_owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (schedule_owner_id, team_id, viewer_id)
);

-- ========================================
-- 8. RLS Policies for shared tables
-- ========================================

-- Shared Experiment Types
ALTER TABLE public.shared_experiment_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view" ON public.shared_experiment_types FOR SELECT USING (public.is_team_member(team_id));
CREATE POLICY "Team members can insert" ON public.shared_experiment_types FOR INSERT WITH CHECK (public.is_team_member(team_id));
CREATE POLICY "Team members can update" ON public.shared_experiment_types FOR UPDATE USING (public.is_team_member(team_id));
CREATE POLICY "Team members can delete" ON public.shared_experiment_types FOR DELETE USING (public.is_team_member(team_id));

-- Shared Steps
ALTER TABLE public.shared_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team access via experiment type" ON public.shared_steps FOR ALL
USING (EXISTS (SELECT 1 FROM public.shared_experiment_types et WHERE et.id = experiment_type_id AND public.is_team_member(et.team_id)));

-- Shared Blocks
ALTER TABLE public.shared_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team access via experiment type" ON public.shared_blocks FOR ALL
USING (EXISTS (SELECT 1 FROM public.shared_experiment_types et WHERE et.id = experiment_type_id AND public.is_team_member(et.team_id)));

-- Shared Block Steps
ALTER TABLE public.shared_block_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team access via block" ON public.shared_block_steps FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.shared_blocks b 
  JOIN public.shared_experiment_types et ON et.id = b.experiment_type_id 
  WHERE b.id = block_id AND public.is_team_member(et.team_id)
));

-- Shared Protocols
ALTER TABLE public.shared_protocols ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view" ON public.shared_protocols FOR SELECT USING (public.is_team_member(team_id));
CREATE POLICY "Team members can insert" ON public.shared_protocols FOR INSERT WITH CHECK (public.is_team_member(team_id));
CREATE POLICY "Team members can update" ON public.shared_protocols FOR UPDATE USING (public.is_team_member(team_id));
CREATE POLICY "Team members can delete" ON public.shared_protocols FOR DELETE USING (public.is_team_member(team_id));

-- Shared Protocol Blocks
ALTER TABLE public.shared_protocol_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team access via protocol" ON public.shared_protocol_blocks FOR ALL
USING (EXISTS (SELECT 1 FROM public.shared_protocols p WHERE p.id = protocol_id AND public.is_team_member(p.team_id)));

-- Shared Milestones
ALTER TABLE public.shared_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view" ON public.shared_milestones FOR SELECT USING (public.is_team_member(team_id));
CREATE POLICY "Team members can insert" ON public.shared_milestones FOR INSERT WITH CHECK (public.is_team_member(team_id));
CREATE POLICY "Team members can update" ON public.shared_milestones FOR UPDATE USING (public.is_team_member(team_id));
CREATE POLICY "Team members can delete" ON public.shared_milestones FOR DELETE USING (public.is_team_member(team_id));

-- Shared Milestone Items
ALTER TABLE public.shared_milestone_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team access via milestone" ON public.shared_milestone_items FOR ALL
USING (EXISTS (SELECT 1 FROM public.shared_milestones m WHERE m.id = milestone_id AND public.is_team_member(m.team_id)));

-- Shared Reagents
ALTER TABLE public.shared_reagents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view" ON public.shared_reagents FOR SELECT USING (public.is_team_member(team_id));
CREATE POLICY "Team members can insert" ON public.shared_reagents FOR INSERT WITH CHECK (public.is_team_member(team_id));
CREATE POLICY "Team members can update" ON public.shared_reagents FOR UPDATE USING (public.is_team_member(team_id));
CREATE POLICY "Team members can delete" ON public.shared_reagents FOR DELETE USING (public.is_team_member(team_id));

-- Shared Schedules
ALTER TABLE public.shared_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage own schedules"
ON public.shared_schedules FOR ALL
USING (user_id = auth.uid());

CREATE POLICY "Viewers can see shared schedules"
ON public.shared_schedules FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.schedule_visibility sv
    WHERE sv.schedule_owner_id = shared_schedules.user_id
    AND sv.team_id = shared_schedules.team_id
    AND sv.viewer_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = shared_schedules.team_id
    AND tm.user_id = auth.uid()
    AND tm.role IN ('owner', 'teacher')
  )
);

-- Schedule Visibility
ALTER TABLE public.schedule_visibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage visibility"
ON public.schedule_visibility FOR ALL
USING (schedule_owner_id = auth.uid());

CREATE POLICY "Viewers can see their visibility entries"
ON public.schedule_visibility FOR SELECT
USING (viewer_id = auth.uid());

-- ========================================
-- 9. Indexes
-- ========================================
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_et_team ON public.shared_experiment_types(team_id);
CREATE INDEX IF NOT EXISTS idx_shared_protocols_team ON public.shared_protocols(team_id);
CREATE INDEX IF NOT EXISTS idx_shared_milestones_team ON public.shared_milestones(team_id);
CREATE INDEX IF NOT EXISTS idx_shared_reagents_team ON public.shared_reagents(team_id);
CREATE INDEX IF NOT EXISTS idx_shared_schedules_team ON public.shared_schedules(team_id);
CREATE INDEX IF NOT EXISTS idx_shared_schedules_user ON public.shared_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_schedule_visibility_viewer ON public.schedule_visibility(viewer_id);
