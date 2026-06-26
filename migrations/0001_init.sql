-- Initial schema. Two schemas mirror the ownership split from the architecture docs:
--   app.*     — app-owned operational data (config, FAAB, keepers, ...)  [web writes]
--   sleeper.* — ingested Sleeper history (leagues, matchups, ...)        [ingestion writes]
-- Role separation (ingest_rw / web_rw) is in migrations/ROLES.sql, applied per
-- environment out-of-band (managed hosts differ in how roles are provisioned).

create extension if not exists pgcrypto;  -- gen_random_uuid()

create schema if not exists app;
create schema if not exists sleeper;

-- --- app-owned (sample subset; full set per docs/PHASE1) --------------------
create table if not exists app.app_config (
    id                boolean primary key default true,
    default_league_id text,
    constraint app_config_singleton check (id)
);

create table if not exists app.faab_transactions (
    id           uuid primary key default gen_random_uuid(),
    league_id    text not null,
    roster_id    text not null,
    amount       integer not null,          -- signed: + grant, - penalty
    reason       text not null,
    created_by   text not null,
    is_migration boolean not null default false,
    created_at   timestamptz not null default now()
);
create index if not exists faab_tx_league on app.faab_transactions (league_id);

-- --- sleeper-sourced (sample subset; full set per docs/STORAGE_AND_INGESTION) ---
create table if not exists sleeper.nfl_state (
    id          boolean primary key default true,
    season      text,
    week        integer,
    season_type text,
    synced_at   timestamptz not null default now(),
    constraint nfl_state_singleton check (id)
);

create table if not exists sleeper.leagues (
    league_id          text primary key,
    season             text,
    name               text,
    status             text,
    previous_league_id text,
    settings           jsonb not null default '{}'::jsonb,
    is_final           boolean not null default false,
    synced_at          timestamptz not null default now()
);
