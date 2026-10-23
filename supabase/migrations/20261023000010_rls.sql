-- Faza 3 · 10/14 · RLS politike
-- Pravilo: RLS uključen na SVAKOJ tabeli. Tabela bez politika = zabranjena za anon/authenticated
-- (service_role zaobilazi RLS). Pisanje u finansijske i statusne tabele ide samo kroz RPC.

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Identitet
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_platform_admin() or public.shares_workspace_with(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() and not public.is_impersonation_readonly())
  with check (id = auth.uid());

create policy workspaces_select on public.workspaces for select to authenticated
  using (deleted_at is null and public.is_workspace_member(id));
create policy workspaces_update on public.workspaces for update to authenticated
  using (deleted_at is null and public.can_admin(id))
  with check (public.can_admin(id));

create policy workspace_members_select on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy workspace_members_update on public.workspace_members for update to authenticated
  using (public.can_admin(workspace_id))
  with check (public.can_admin(workspace_id));
create policy workspace_members_delete on public.workspace_members for delete to authenticated
  using (public.can_admin(workspace_id) or (user_id = auth.uid() and not public.is_impersonation_readonly()));

create policy member_brand_access_select on public.member_brand_access for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy member_brand_access_write on public.member_brand_access for all to authenticated
  using (public.can_admin(workspace_id))
  with check (public.can_admin(workspace_id));

create policy invitations_select on public.invitations for select to authenticated
  using (public.can_admin(workspace_id));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (public.can_admin(workspace_id) and invited_by = auth.uid());
create policy invitations_update on public.invitations for update to authenticated
  using (public.can_admin(workspace_id))
  with check (public.can_admin(workspace_id));
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.can_admin(workspace_id));

-- ---------------------------------------------------------------------------
-- Brend i znanje
-- ---------------------------------------------------------------------------
create policy brands_select on public.brands for select to authenticated
  using (deleted_at is null and public.has_brand_access(id));
create policy brands_insert on public.brands for insert to authenticated
  with check (public.can_edit(workspace_id));
create policy brands_update on public.brands for update to authenticated
  using (public.can_edit_brand(id))
  with check (public.can_edit(workspace_id));

create policy brand_profiles_select on public.brand_profiles for select to authenticated
  using (public.has_brand_access(brand_id));
create policy brand_profiles_insert on public.brand_profiles for insert to authenticated
  with check (public.can_edit_brand(brand_id) and created_by = auth.uid());
create policy brand_profiles_update on public.brand_profiles for update to authenticated
  using (public.can_edit_brand(brand_id))
  with check (public.can_edit_brand(brand_id));

create policy website_crawls_select on public.website_crawls for select to authenticated
  using (public.has_brand_access(brand_id));
create policy website_pages_select on public.website_pages for select to authenticated
  using (public.has_brand_access(brand_id));
create policy brand_site_checks_select on public.brand_site_checks for select to authenticated
  using (public.has_brand_access(brand_id));
-- knowledge_chunks: samo service_role (nema politika)

create policy competitors_select on public.competitors for select to authenticated
  using (public.has_brand_access(brand_id));
create policy competitors_write on public.competitors for all to authenticated
  using (public.can_edit_brand(brand_id))
  with check (public.can_edit_brand(brand_id));

-- ---------------------------------------------------------------------------
-- Integracije
-- ---------------------------------------------------------------------------
-- Token kolone: oduzmi SELECT na nivou tabele i vrati samo bezopasne kolone.
revoke all on public.social_accounts from anon, authenticated;
grant select (id, brand_id, workspace_id, platform, external_id, external_parent_id, name, username, avatar_url,
              account_type, key_version, token_expires_at, scopes, status, status_reason, capabilities, metadata,
              assisted_only, last_synced_at, last_error, connected_by, created_at, updated_at)
  on public.social_accounts to authenticated;
grant update (status, status_reason) on public.social_accounts to authenticated;
grant delete on public.social_accounts to authenticated;
grant select on public.social_accounts_public to authenticated;

create policy social_accounts_select on public.social_accounts for select to authenticated
  using (public.has_brand_access(brand_id));
create policy social_accounts_update on public.social_accounts for update to authenticated
  using (public.can_admin_brand(brand_id))
  with check (public.can_admin_brand(brand_id));
create policy social_accounts_delete on public.social_accounts for delete to authenticated
  using (public.can_admin_brand(brand_id));

revoke all on public.oauth_states from anon, authenticated;

revoke all on public.canva_connections from anon, authenticated;
grant select (id, workspace_id, user_id, canva_user_id, team_id, plan_hint, autofill_available,
              token_expires_at, scopes, status, created_at, updated_at)
  on public.canva_connections to authenticated;
grant delete on public.canva_connections to authenticated;
grant select on public.canva_connections_public to authenticated;
create policy canva_connections_select on public.canva_connections for select to authenticated
  using (user_id = auth.uid() or public.can_admin(workspace_id));
create policy canva_connections_delete on public.canva_connections for delete to authenticated
  using (user_id = auth.uid() and not public.is_impersonation_readonly());

create policy historical_posts_select on public.historical_posts for select to authenticated
  using (public.has_brand_access(brand_id));

-- ---------------------------------------------------------------------------
-- Sadržaj
-- ---------------------------------------------------------------------------
create policy media_assets_select on public.media_assets for select to authenticated
  using (
    deleted_at is null
    and ((brand_id is not null and public.has_brand_access(brand_id))
         or (brand_id is null and public.is_workspace_member(workspace_id)))
  );
create policy media_assets_insert on public.media_assets for insert to authenticated
  with check (
    public.can_edit(workspace_id)
    and (brand_id is null or public.has_brand_access(brand_id))
    and uploaded_by = auth.uid()
  );
create policy media_assets_update on public.media_assets for update to authenticated
  using (public.can_edit(workspace_id) and (brand_id is null or public.has_brand_access(brand_id)))
  with check (public.can_edit(workspace_id));

create policy strategies_select on public.strategies for select to authenticated
  using (public.has_brand_access(brand_id));
create policy strategies_write on public.strategies for all to authenticated
  using (public.can_edit_brand(brand_id))
  with check (public.can_edit_brand(brand_id));

create policy content_pillars_select on public.content_pillars for select to authenticated
  using (public.has_brand_access(brand_id));
create policy content_pillars_write on public.content_pillars for all to authenticated
  using (public.can_edit_brand(brand_id))
  with check (public.can_edit_brand(brand_id));

create policy campaigns_select on public.campaigns for select to authenticated
  using (public.has_brand_access(brand_id));
create policy campaigns_write on public.campaigns for all to authenticated
  using (public.can_edit_brand(brand_id))
  with check (public.can_edit_brand(brand_id));

create policy posts_select on public.posts for select to authenticated
  using (deleted_at is null and public.has_brand_access(brand_id));
create policy posts_insert on public.posts for insert to authenticated
  with check (
    public.can_edit_brand(brand_id)
    and workspace_id = public.brand_workspace(brand_id)
    and created_by = auth.uid()
  );
create policy posts_update on public.posts for update to authenticated
  using (deleted_at is null and public.can_edit_brand(brand_id) and locked_at is null)
  with check (public.can_edit_brand(brand_id) and workspace_id = public.brand_workspace(brand_id));

create policy post_targets_select on public.post_targets for select to authenticated
  using (public.has_brand_access(brand_id));
create policy post_targets_insert on public.post_targets for insert to authenticated
  with check (public.can_edit_brand(brand_id));
create policy post_targets_update on public.post_targets for update to authenticated
  using (public.can_edit_brand(brand_id))
  with check (public.can_edit_brand(brand_id));
create policy post_targets_delete on public.post_targets for delete to authenticated
  using (public.can_edit_brand(brand_id));

create policy post_media_select on public.post_media for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and public.has_brand_access(p.brand_id)));
create policy post_media_write on public.post_media for all to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and public.can_edit_brand(p.brand_id)))
  with check (exists (select 1 from public.posts p where p.id = post_id and public.can_edit_brand(p.brand_id)));

create policy post_versions_select on public.post_versions for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and public.has_brand_access(p.brand_id)));

create policy post_comments_select on public.post_comments for select to authenticated
  using (deleted_at is null and public.has_brand_access(brand_id));
create policy post_comments_insert on public.post_comments for insert to authenticated
  with check (public.has_brand_access(brand_id) and author_id = auth.uid() and not public.is_impersonation_readonly());
create policy post_comments_update on public.post_comments for update to authenticated
  using (author_id = auth.uid() and not public.is_impersonation_readonly())
  with check (author_id = auth.uid());

create policy approvals_select on public.approvals for select to authenticated
  using (public.has_brand_access(brand_id));

create policy approval_links_select on public.approval_links for select to authenticated
  using (public.can_edit_brand(brand_id));
create policy approval_links_insert on public.approval_links for insert to authenticated
  with check (public.can_edit_brand(brand_id) and created_by = auth.uid());
create policy approval_links_update on public.approval_links for update to authenticated
  using (public.can_edit_brand(brand_id))
  with check (public.can_edit_brand(brand_id));
create policy approval_links_delete on public.approval_links for delete to authenticated
  using (public.can_edit_brand(brand_id));

create policy publish_attempts_select on public.publish_attempts for select to authenticated
  using (public.has_brand_access(brand_id));

create policy queue_slots_select on public.queue_slots for select to authenticated
  using (public.has_brand_access(brand_id));
create policy queue_slots_write on public.queue_slots for all to authenticated
  using (public.can_edit_brand(brand_id))
  with check (public.can_edit_brand(brand_id));

create policy suggestions_select on public.suggestions for select to authenticated
  using (public.has_brand_access(brand_id));
create policy suggestions_update on public.suggestions for update to authenticated
  using (public.can_edit_brand(brand_id))
  with check (public.can_edit_brand(brand_id));

create policy holidays_select on public.holidays for select to authenticated using (true);
create policy status_transitions_select on public.status_transitions for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- AI i analitika
-- ---------------------------------------------------------------------------
revoke all on public.ai_generations from anon, authenticated;
grant select on public.ai_generations to authenticated;
grant select on public.ai_generations_public to authenticated;
create policy ai_generations_select on public.ai_generations for select to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (brand_id is null or public.has_brand_access(brand_id))
    and (user_id = auth.uid() or public.workspace_role(workspace_id) in ('owner', 'admin', 'editor'))
  );

create policy post_metrics_select on public.post_metrics_snapshots for select to authenticated
  using (public.has_brand_access(brand_id));
create policy account_metrics_select on public.account_metrics_daily for select to authenticated
  using (public.has_brand_access(brand_id));
create policy insights_select on public.insights for select to authenticated
  using (public.has_brand_access(brand_id));
create policy reports_select on public.reports for select to authenticated
  using (public.has_brand_access(brand_id));

-- ---------------------------------------------------------------------------
-- Naplata i tokeni (klijent samo čita; pisanje isključivo kroz RPC)
-- ---------------------------------------------------------------------------
revoke all on public.plans from anon, authenticated;
grant select on public.plans to anon, authenticated;
create policy plans_select on public.plans for select to anon, authenticated using (is_active);

revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.can_admin(workspace_id));

revoke all on public.token_grants from anon, authenticated;
grant select on public.token_grants to authenticated;
create policy token_grants_select on public.token_grants for select to authenticated
  using (public.can_admin(workspace_id));

revoke all on public.token_ledger from anon, authenticated;
grant select on public.token_ledger to authenticated;
create policy token_ledger_select on public.token_ledger for select to authenticated
  using (public.can_admin(workspace_id));

revoke all on public.token_reservations from anon, authenticated;
grant select on public.token_reservations to authenticated;
create policy token_reservations_select on public.token_reservations for select to authenticated
  using (public.can_admin(workspace_id));

revoke all on public.payment_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin i sistem
-- ---------------------------------------------------------------------------
revoke all on public.admin_audit_log from anon, authenticated;
revoke all on public.impersonation_sessions from anon, authenticated;
revoke all on public.platform_admin_allowlist from anon, authenticated;
revoke all on public.idempotency_keys from anon, authenticated;
revoke all on public.user_flags from anon, authenticated;

revoke all on public.feature_flags from anon, authenticated;
grant select (key, enabled, updated_at) on public.feature_flags to authenticated;
create policy feature_flags_select on public.feature_flags for select to authenticated using (true);

revoke all on public.platform_settings from anon, authenticated;
grant select (key, value, updated_at, is_public) on public.platform_settings to anon, authenticated;
grant select on public.platform_settings_public to anon, authenticated;
create policy platform_settings_select on public.platform_settings for select to anon, authenticated using (is_public);

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

create policy notification_preferences_all on public.notification_preferences for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));

revoke all on public.account_deletion_requests from anon, authenticated;
grant select on public.account_deletion_requests to authenticated;
create policy account_deletion_requests_select on public.account_deletion_requests for select to authenticated
  using (user_id = auth.uid());

revoke all on public.data_exports from anon, authenticated;
grant select on public.data_exports to authenticated;
create policy data_exports_select on public.data_exports for select to authenticated
  using (user_id = auth.uid());
