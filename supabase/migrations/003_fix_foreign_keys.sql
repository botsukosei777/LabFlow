-- Fix foreign keys to reference public.profiles instead of auth.users
-- This resolves the "Could not find a relationship between 'team_members' and 'profiles'" error

ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_created_by_fkey;
ALTER TABLE public.teams ADD CONSTRAINT teams_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_user_id_fkey;
ALTER TABLE public.team_members ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.shared_experiment_types DROP CONSTRAINT IF EXISTS shared_experiment_types_shared_by_fkey;
ALTER TABLE public.shared_experiment_types ADD CONSTRAINT shared_experiment_types_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.shared_protocols DROP CONSTRAINT IF EXISTS shared_protocols_shared_by_fkey;
ALTER TABLE public.shared_protocols ADD CONSTRAINT shared_protocols_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.shared_milestones DROP CONSTRAINT IF EXISTS shared_milestones_shared_by_fkey;
ALTER TABLE public.shared_milestones ADD CONSTRAINT shared_milestones_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
