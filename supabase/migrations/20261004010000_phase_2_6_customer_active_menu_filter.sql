-- Allow the public client to express the active-menu predicate explicitly.
-- RLS still restricts anonymous rows to the same active window.
grant select (is_current, deactivated_at)
  on public.published_menus to anon;
