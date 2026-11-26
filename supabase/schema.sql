-- RISA Labs Growth Center — Sponsorship Growth (Challenge B)
-- Postgres / Supabase schema. Safe to re-run: drops and recreates everything.
--
-- Design principles
--   * Source tables mirror the xlsx 1:1 (deduplicated). Rows created inside the app are
--     marked with source = 'app' so sourced facts and user edits never get confused.
--   * History tables are append-only full-state versions. A stage change in the UI
--     INSERTS a new version; it never overwrites the past (time travel stays correct).
--   * Everything not in the source dataset (payments, budgets, tasks, new bets) lives in
--     clearly separate operational tables.

drop table if exists copilot_log cascade;
drop table if exists tasks cascade;
drop table if exists payments cascade;
drop table if exists campaign_budgets cascade;
drop table if exists data_hygiene_logs cascade;
drop table if exists sponsor_activations cascade;
drop table if exists opportunity_history cascade;
drop table if exists opportunities cascade;
drop table if exists brand_qualification cascade;
drop table if exists sponsor_interactions cascade;
drop table if exists sponsor_campaigns cascade;
drop table if exists contacts cascade;
drop table if exists brands cascade;
drop table if exists targets cascade;
drop table if exists event cascade;

create table event (
  event_name text primary key,
  history_start date not null,
  history_end date not null,
  event_starts_at timestamptz not null,
  event_ends_at timestamptz not null,
  timezone text not null,
  currency text not null
);

create table targets (
  target_version text primary key,
  effective_at timestamptz not null,
  qualified_brands_goal int not null,
  confirmed_partnerships_goal int not null
);

create table brands (
  brand_id text primary key,
  brand_name text not null,
  industry text not null,
  owner_id text,
  owner_name text,
  created_at timestamptz not null
);

create table contacts (
  contact_id text primary key,
  contact_name text not null,
  job_title text,
  brand_id text not null references brands(brand_id),
  created_at timestamptz not null
);

create table sponsor_campaigns (
  sponsor_campaign_id text primary key,
  campaign_name text not null,
  channel text not null,
  objective text,
  audience text,
  owner_id text,
  owner_name text,
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  created_at timestamptz not null,
  -- operational fields (not in source)
  source text not null default 'dataset' check (source in ('dataset','app')),
  status text not null default 'active' check (status in ('planned','active','paused','stopped')),
  target_contribution_inr bigint not null default 0,
  hypothesis text
);

create table sponsor_interactions (
  interaction_id text primary key,
  attempt_id text not null,
  origin_interaction_id text,
  brand_id text not null references brands(brand_id),
  contact_id text references contacts(contact_id),
  sponsor_campaign_id text references sponsor_campaigns(sponsor_campaign_id),
  channel text,
  event_type text not null,
  outcome text,
  summary text,
  occurred_at timestamptz not null,
  owner_id text,
  source text not null default 'dataset' check (source in ('dataset','app')),
  recorded_at timestamptz not null default now()
);
create index on sponsor_interactions (occurred_at);
create index on sponsor_interactions (sponsor_campaign_id);

create table brand_qualification (
  history_id text primary key,
  brand_id text not null references brands(brand_id),
  qualification_status text not null check (qualification_status in ('unreviewed','engaged','qualified','unqualified','dormant')),
  reason text,
  sponsor_campaign_id text references sponsor_campaigns(sponsor_campaign_id),
  effective_at timestamptz not null,
  source text not null default 'dataset' check (source in ('dataset','app')),
  recorded_at timestamptz not null default now()
);
create index on brand_qualification (brand_id, effective_at);

create table opportunities (
  opportunity_id text primary key,
  opportunity_name text not null,
  brand_id text not null references brands(brand_id),
  primary_contact_id text references contacts(contact_id),
  sponsor_campaign_id text references sponsor_campaigns(sponsor_campaign_id),
  support_type text not null check (support_type in ('cash','in_kind')),
  created_at timestamptz not null,
  source text not null default 'dataset' check (source in ('dataset','app'))
);

create table opportunity_history (
  history_id text primary key,
  opportunity_id text not null references opportunities(opportunity_id),
  stage text not null check (stage in ('prospecting','contacted','proposal_sent','negotiating','partner_confirmed','lost','withdrawn')),
  proposed_value_inr bigint not null default 0,
  confirmed_value_inr bigint not null default 0,
  support_type text check (support_type in ('cash','in_kind')), -- null = inherit from opportunity
  owner_id text,
  owner_name text,
  effective_at timestamptz not null,
  note text,
  source text not null default 'dataset' check (source in ('dataset','app')),
  recorded_at timestamptz not null default now()
);
create index on opportunity_history (opportunity_id, effective_at);

create table sponsor_activations (
  activation_id text primary key,
  brand_id text not null references brands(brand_id),
  opportunity_id text not null references opportunities(opportunity_id),
  attendee_campaign_id text not null,
  attendee_campaign_name text not null,
  activation_note text,
  linked_at timestamptz not null
);

-- Transparent record of every duplicate removed on ingest.
create table data_hygiene_logs (
  id serial primary key,
  source_sheet text not null,
  source_id text not null,
  raw_rows int not null,
  kept_rows int not null,
  action text not null,
  logged_at timestamptz not null default now()
);

-- NOT IN SOURCE. Bank receipts logged by users. cash_collected_inr per opportunity = sum(amount_inr).
create table payments (
  payment_id serial primary key,
  opportunity_id text not null references opportunities(opportunity_id),
  amount_inr bigint not null check (amount_inr > 0),
  received_at timestamptz not null,
  reference text,
  created_at timestamptz not null default now()
);

-- NOT IN SOURCE. Planning budgets per campaign, entered by the team (seeded as labelled assumptions).
create table campaign_budgets (
  sponsor_campaign_id text primary key references sponsor_campaigns(sponsor_campaign_id),
  budget_inr bigint not null default 0,
  spent_inr bigint not null default 0,
  basis text not null default 'assumption'
);

create table tasks (
  task_id serial primary key,
  title text not null,
  description text,
  owner_name text,
  linked_opportunity_id text references opportunities(opportunity_id),
  linked_campaign_id text references sponsor_campaigns(sponsor_campaign_id),
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  due_date date,
  status text not null default 'todo' check (status in ('todo','in_progress','done')),
  created_by text not null default 'user' check (created_by in ('user','ai_copilot')),
  rationale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Audit trail of copilot tool calls (useful for demoing grounding).
create table copilot_log (
  id serial primary key,
  question text,
  tools_called jsonb,
  created_at timestamptz not null default now()
);
