create extension if not exists pgcrypto;

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  role text not null check (role in ('salesperson','expense_reporter','manager')),
  telegram_user_id bigint unique,
  telegram_chat_id bigint,
  created_at timestamptz not null default now()
);

insert into employees (code,name,role) values
('richard','Richard Darling','salesperson'),
('anastasia','Anastasia Ferrari','salesperson'),
('jean','Jean-Claude Bērziņš','salesperson'),
('kevin','Kevin von Whatever','expense_reporter'),
('svetlana','Svetlana de Monte Carlo','manager')
on conflict (code) do nothing;

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  submitted_at timestamptz not null default now(),
  salesperson_code text not null references employees(code),
  customer text not null,
  project text not null check(project in ('A','B')),
  description text not null,
  amount numeric(12,2) not null check(amount>0),
  proposed_richard numeric(5,2) not null check(proposed_richard between 0 and 100),
  proposed_anastasia numeric(5,2) not null check(proposed_anastasia between 0 and 100),
  proposed_jean numeric(5,2) not null check(proposed_jean between 0 and 100),
  approved_richard numeric(5,2), approved_anastasia numeric(5,2), approved_jean numeric(5,2),
  commission_pool numeric(12,2) not null default 0,
  commission_richard numeric(12,2) not null default 0,
  commission_anastasia numeric(12,2) not null default 0,
  commission_jean numeric(12,2) not null default 0,
  status text not null default 'Pending approval' check(status in ('Pending approval','Approved')),
  original_telegram_chat_id bigint,
  sheet_sync_status text not null default 'pending' check(sheet_sync_status in ('pending','ok','failed')),
  notification_status text not null default 'not_required' check(notification_status in ('not_required','sent','failed','no_recipient')),
  constraint proposed_split_total check(abs((proposed_richard+proposed_anastasia+proposed_jean)-100)<0.001)
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  submitted_at timestamptz not null default now(),
  reporter_code text not null references employees(code),
  description text not null,
  category text not null check(category in ('Materials','Travel','Other')),
  amount numeric(12,2) not null check(amount>0),
  proposed_allocation text not null check(proposed_allocation in ('A','B','Company overhead')),
  final_allocation text check(final_allocation in ('A','B','Company overhead')),
  status text not null check(status in ('Awaiting allocation','Allocated')),
  original_telegram_chat_id bigint,
  sheet_sync_status text not null default 'pending' check(sheet_sync_status in ('pending','ok','failed')),
  notification_status text not null default 'not_required' check(notification_status in ('not_required','sent','failed','no_recipient'))
);

create index if not exists idx_sales_status on sales(status);
create index if not exists idx_expenses_status on expenses(status);
