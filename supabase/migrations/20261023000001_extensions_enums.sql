-- Faza 3 · 1/14 · ekstenzije i enumi
-- Sve ekstenzije idu u šemu `extensions` (Supabase konvencija).

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create type public.platform_role as enum ('user', 'platform_admin');
create type public.workspace_type as enum ('business', 'agency');
create type public.workspace_role as enum ('owner', 'admin', 'editor', 'approver', 'viewer');
create type public.invitation_status as enum ('pending', 'accepted', 'expired', 'revoked');
create type public.brand_status as enum ('active', 'paused', 'archived');
create type public.crawl_status as enum ('queued', 'running', 'succeeded', 'partial', 'failed', 'canceled');
create type public.page_type as enum (
  'home', 'about', 'services', 'products', 'pricing', 'portfolio', 'case_study',
  'blog_index', 'blog_post', 'reviews', 'faq', 'contact', 'team', 'careers', 'legal', 'other'
);
create type public.social_platform as enum (
  'facebook', 'instagram', 'linkedin', 'tiktok', 'x', 'youtube', 'pinterest', 'google_business'
);
create type public.social_account_status as enum ('active', 'needs_reauth', 'disabled', 'revoked');
create type public.post_status as enum (
  'draft', 'in_review', 'approved', 'scheduled', 'publishing', 'published',
  'partially_published', 'failed', 'rejected', 'paused', 'canceled'
);
create type public.target_status as enum (
  'pending', 'scheduled', 'publishing', 'published', 'failed', 'paused',
  'needs_reauth', 'canceled', 'deleted_externally', 'assisted_pending', 'assisted_done'
);
create type public.post_source as enum ('manual', 'ai', 'autopilot', 'suggestion', 'evergreen', 'import');
create type public.media_source as enum ('upload', 'canva', 'unsplash', 'template', 'gemini');
create type public.media_kind as enum ('image', 'video');
create type public.ai_generation_type as enum (
  'text', 'rewrite', 'translate', 'hashtags', 'repurpose', 'variants',
  'image_from_photo', 'image_from_prompt', 'visual_template', 'vision_describe', 'unsplash_rank',
  'strategy', 'insights', 'brand_profile', 'photo_style', 'embedding', 'quality_check',
  'canva_design', 'canva_export'
);
create type public.ai_generation_status as enum ('queued', 'running', 'succeeded', 'failed', 'canceled');
create type public.token_grant_source as enum ('signup', 'subscription', 'topup', 'admin', 'refund');
create type public.token_reservation_status as enum ('reserved', 'confirmed', 'released', 'expired');
create type public.ledger_reason as enum ('grant', 'consume', 'refund', 'admin_adjust', 'expire');
create type public.plan_kind as enum ('subscription', 'topup');
create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'paused'
);
create type public.payment_event_status as enum ('received', 'processing', 'processed', 'failed', 'ignored');
create type public.suggestion_source as enum (
  'blog', 'site_change', 'holiday', 'analytics', 'insight', 'evergreen', 'manual'
);
create type public.suggestion_status as enum ('new', 'accepted', 'dismissed', 'expired');
create type public.approval_decision as enum ('approved', 'rejected', 'changes_requested');
create type public.strategy_status as enum ('draft', 'active', 'archived');
create type public.impersonation_mode as enum ('read_only', 'full');
create type public.notification_channel as enum ('in_app', 'email');

-- Zajednički trigger za updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
