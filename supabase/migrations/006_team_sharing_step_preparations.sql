-- ========================================
-- 7. Shared Step Preparations
-- ========================================
CREATE TABLE IF NOT EXISTS public.shared_step_preparations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID NOT NULL REFERENCES public.shared_steps(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  timing_type TEXT NOT NULL DEFAULT 'before_experiment',
  timing_step_id UUID REFERENCES public.shared_steps(id) ON DELETE SET NULL,
  timing_offset_minutes INTEGER DEFAULT 0,
  requires_check BOOLEAN DEFAULT false
);

-- RLS for Shared Step Preparations
ALTER TABLE public.shared_step_preparations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team access via step" ON public.shared_step_preparations FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.shared_steps s
  JOIN public.shared_experiment_types et ON et.id = s.experiment_type_id
  WHERE s.id = step_id AND public.is_team_member(et.team_id)
));

-- Grant permissions to roles
GRANT ALL ON TABLE public.shared_step_preparations TO anon, authenticated, service_role;
