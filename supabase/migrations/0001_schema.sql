-- ============================================================
-- ALMA CONSULTING PLATFORM — 0001: Core schema
-- Target: Supabase / PostgreSQL 15+
-- Money: numeric(12,2). IDs: uuid. Timestamps: timestamptz.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- ENUMS ----------
create type user_role        as enum ('super_admin','director','agent','student','pending');
create type interface_lang   as enum ('fr','en','ar');
create type doc_item_status  as enum ('not_requested','requested','uploaded','under_review','changes_requested','approved','waived','expired','superseded');
create type task_status      as enum ('todo','in_progress','done','cancelled');
create type task_priority    as enum ('low','normal','high','urgent');
create type payment_method   as enum ('cash','bank_transfer');
create type payment_status   as enum ('pending_verification','verified','rejected','refunded');
create type invoice_status   as enum ('issued','partially_paid','paid','void');

-- Union of university + visa workflows (spec §6)
create type case_stage as enum (
  'draft','documents_in_progress','ready_for_review','changes_requested',
  'approved_for_submission','appointment_booked','submitted',
  'biometrics_interview','additional_info_requested',
  'accepted','rejected','withdrawn','closed',
  'visa_approved','visa_refused'
);

-- ---------- AGENCIES ----------
create table agencies (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  city                text,
  address             text,
  phone               text,
  email               text,
  bank_name           text,
  bank_account_holder text,
  bank_iban           text,
  bank_instructions   text,
  invoice_prefix      text not null unique,          -- ex: OUJ, NAD
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------- PROFILES (mirrors auth.users) ----------
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  staff_code    text unique,                           -- ALMA-0001 …
  full_name     text not null default '',
  email         text,
  role          user_role not null default 'pending',
  agency_id     uuid references agencies(id),
  student_id    uuid,                                  -- filled for role='student' (FK added below)
  is_active     boolean not null default false,        -- activated by authorized staff
  last_login_at timestamptz,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table profiles add constraint fk_student
  foreign key (student_id) references students(id);

-- ---------- COUNTRIES / SERVICE TYPES / TEMPLATES ----------
create table countries (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,                     -- LT, LV, EE…
  name_fr    text not null,
  name_en    text not null,
  sort_order int not null default 0
);

create table service_types (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,                     -- university_application, visa_trp…
  label_fr   text not null,
  label_en   text not null,
  is_active  boolean not null default true
);

create table service_templates (
  id               uuid primary key default gen_random_uuid(),
  country_id       uuid not null references countries(id),
  service_type_id  uuid not null references service_types(id),
  version          int  not null default 1,
  status           text not null default 'draft'
                   check (status in ('draft','published','archived')),
  published_at     timestamptz,
  created_by       uuid references profiles(id),
  created_at       timestamptz not null default now(),
  unique (country_id, service_type_id, version)
);

create table document_templates (
  id                    uuid primary key default gen_random_uuid(),
  template_id           uuid not null references service_templates(id) on delete cascade,
  name_fr               text not null,
  name_en               text not null,
  guidance_fr           text,
  guidance_en           text,
  is_required           boolean not null default true,
  translation_required  boolean not null default false,
  legalisation_required boolean not null default false,
  legalisation_mode     text,                          -- apostille | consular_legalisation | sworn_translation | certified_copy | other
  original_required     boolean not null default false,
  validity_rule         text,                          -- ex: 'max_3_months' | 'passport_valid_6m'
  sort_order            int not null default 0
);

-- ---------- STUDENTS ----------
create sequence student_ref_seq start 1;

create table students (
  id                       uuid primary key default gen_random_uuid(),
  ref                      text not null unique default 'ALMA-ST-' || lpad(nextval('student_ref_seq')::text, 5, '0'),
  full_name                text not null,
  date_of_birth            date,
  place_of_birth           text,
  nationality              text not null default 'MA',
  cin_number               text,
  passport_number          text,
  passport_issue_date      date,
  passport_expiry_date     date,
  passport_authority       text,
  email                    text,
  phone                    text,
  address                  text,
  preferred_language       interface_lang not null default 'fr',
  agency_id                uuid not null references agencies(id),
  main_agent_id            uuid references profiles(id),
  enrolled_at              timestamptz not null default now(),
  agreement_signed_at      date,
  agreement_signed_in_agency boolean not null default true,  -- spec §5: signature en agence uniquement
  agreement_scan_path      text,
  privacy_consent_at       timestamptz,
  academic_background      text,
  language_level           text,
  language_certificate     text,
  sponsor_name             text,
  sponsor_relationship     text,
  sponsor_occupation       text,
  sponsor_income_monthly   numeric(12,2),
  visa_refusal_history     text,
  risk_flags               text[] not null default '{}',
  is_archived              boolean not null default false,
  created_by               uuid references profiles(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ---------- CASES (one application = one independent case) ----------
create sequence case_ref_seq start 1;

create table cases (
  id                   uuid primary key default gen_random_uuid(),
  ref                  text not null unique default 'ALMA-CASE-' || lpad(nextval('case_ref_seq')::text, 5, '0'),
  student_id           uuid not null references students(id),
  agency_id            uuid not null references agencies(id),
  agent_id             uuid references profiles(id),
  country_id           uuid not null references countries(id),
  service_type_id      uuid not null references service_types(id),
  university           text,
  program              text,
  study_level          text,
  intake               text,
  intake_month         text check (intake_month in ('september','february')), -- Q16 structured cohort tag
  application_deadline date,
  stage                case_stage not null default 'draft',
  student_status       text,                            -- sanitized label shown to student
  submission_owner     uuid references profiles(id),
  marked_ready_at      timestamptz,
  review_decision      text check (review_decision in ('approved','returned',null)),
  review_comment       text,
  reviewed_by          uuid references profiles(id),
  reviewed_at          timestamptz,
  submitted_at         timestamptz,
  submission_ref       text,
  decision_at          timestamptz,
  decision_outcome     text,
  -- Free-second-chance policy (owner decision): after visa/TRP refusal,
  -- re-file for ANY country/service under same package, zero invoicing.
  is_free_retake       boolean not null default false,
  retake_of_case_id    uuid references cases(id),
  template_id          uuid references service_templates(id),
  template_version     int,
  archived             boolean not null default false,
  created_by           uuid references profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint retake_requires_flag check (
    retake_of_case_id is null or is_free_retake = true
  )
);

-- ---------- CASE CHECKLISTS ----------
create table case_checklist_items (
  id                    uuid primary key default gen_random_uuid(),
  case_id               uuid not null references cases(id) on delete cascade,
  source_template_item  uuid references document_templates(id),
  name_fr               text not null,
  name_en               text not null,
  guidance_fr           text,
  guidance_en           text,
  is_required           boolean not null default true,
  translation_required  boolean not null default false,
  legalisation_required boolean not null default false,
  legalisation_mode     text,
  original_required     boolean not null default false,
  validity_rule         text,
  status                doc_item_status not null default 'not_requested',
  is_custom             boolean not null default false,   -- SA-added per-case item
  added_by              uuid references profiles(id),
  review_comment        text,
  reviewed_by           uuid references profiles(id),
  reviewed_at           timestamptz,
  current_version       int not null default 0,
  sort_order            int not null default 0
);

-- ---------- CASE DOCUMENTS (private storage, versioned) ----------
create table case_documents (
  id               uuid primary key default gen_random_uuid(),
  case_id          uuid not null references cases(id) on delete cascade,
  checklist_item_id uuid not null references case_checklist_items(id) on delete cascade,
  version          int not null,
  storage_path     text not null unique,                 -- {student_id}/{case_id}/{item}/{uuid}.ext
  file_name        text not null,                        -- safe display name
  mime_type        text not null,
  size_bytes       bigint not null,
  status           text not null default 'current'
                   check (status in ('current','superseded','archived')),
  uploaded_by      uuid not null references profiles(id),
  uploaded_at      timestamptz not null default now(),
  review_status    doc_item_status not null default 'under_review',
  review_comment   text,
  reviewed_by      uuid references profiles(id),
  reviewed_at      timestamptz,
  unique (checklist_item_id, version)
);

-- ---------- TASKS ----------
create table tasks (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agencies(id),
  student_id  uuid references students(id),
  case_id     uuid references cases(id),
  title       text not null,
  description text,
  priority    task_priority not null default 'normal',
  status      task_status not null default 'todo',
  due_at      timestamptz,
  assignee    uuid references profiles(id),
  created_by  uuid references profiles(id),
  completed_at timestamptz,
  completed_by uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- BILLING CONFIG ----------
-- Owner-editable mapping: which process stage issues which installment.
create table installment_rules (
  id             int primary key,                        -- 1..4
  trigger_stage  case_stage not null,
  label_fr       text not null,
  label_en       text not null,
  default_amount numeric(12,2) not null default 5000.00,
  is_active      boolean not null default true
);

-- Gapless per-agency-per-year numbering
create table billing_sequences (
  agency_id   uuid not null references agencies(id),
  doc_type    text not null check (doc_type in ('INVOICE','RECEIPT')),
  year        int  not null default extract(year from now())::int,  -- first-issue year (informational)
  last_number int  not null default 0,
  primary key (agency_id, doc_type)          -- Q10: continuous, never resets
);

-- ---------- INVOICES ----------
create table invoices (
  id             uuid primary key default gen_random_uuid(),
  number         text not null unique,                   -- OUJ-FAC-2026-0001
  agency_id      uuid not null references agencies(id),
  year           int  not null,
  seq            int  not null,
  student_id     uuid not null references students(id),
  case_id        uuid references cases(id),
  installment_no int  not null references installment_rules(id),
  amount         numeric(12,2) not null check (amount >= 0),
  currency       text not null default 'MAD',
  status         invoice_status not null default 'issued',
  issued_by      uuid references profiles(id),
  issued_at      timestamptz not null default now(),
  due_date       date,
  voided_by      uuid references profiles(id),
  voided_at      timestamptz,
  void_reason    text,
  created_at     timestamptz not null default now()
);
create unique index ux_invoice_open_installment
  on invoices (student_id, installment_no)
  where status <> 'void';

-- ---------- PAYMENTS ----------
create table payments (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references invoices(id),
  student_id       uuid not null references students(id),
  agency_id        uuid not null references agencies(id),
  case_id          uuid references cases(id),
  method           payment_method not null,
  amount           numeric(12,2) not null check (amount > 0),
  currency         text not null default 'MAD',
  status           payment_status not null default 'pending_verification',
  recorded_by      uuid not null references profiles(id),
  recorded_at      timestamptz not null default now(),
  proof_path       text,
  transfer_ref     text,
  verified_by      uuid references profiles(id),
  verified_at      timestamptz,
  rejection_reason text,
  receipt_id       uuid
);

-- ---------- RECEIPTS (issued ONLY for verified payments) ----------
create table receipts (
  id         uuid primary key default gen_random_uuid(),
  number     text not null unique,                      -- OUJ-REC-2026-0001
  agency_id  uuid not null references agencies(id),
  year       int not null,
  seq        int not null,
  payment_id uuid not null unique references payments(id),
  invoice_id uuid not null references invoices(id),
  student_id uuid not null references students(id),
  amount     numeric(12,2) not null,
  currency   text not null default 'MAD',
  method     payment_method not null,
  verified_by uuid not null references profiles(id),
  issued_at  timestamptz not null default now()
);

alter table payments add constraint fk_receipt
  foreign key (receipt_id) references receipts(id);

-- ---------- READINESS SCORE SNAPSHOTS ----------
create table readiness_evaluations (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references cases(id) on delete cascade,
  score        int not null check (score between 0 and 100),
  breakdown    jsonb not null,
  blockers     jsonb not null default '[]',
  rule_version text not null default 'v1',
  computed_by  uuid references profiles(id),
  computed_at  timestamptz not null default now()
);

-- ---------- COMMUNICATION ----------
-- Student-visible thread (never contains internal data)
create table messages (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students(id) on delete cascade,
  case_id     uuid references cases(id),
  sender_id   uuid not null references profiles(id),
  body        text not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

-- Internal-only notes (NEVER exposed to student portal)
create table internal_notes (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  case_id    uuid references cases(id) on delete cascade,
  body       text not null,
  author_id  uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- EMAIL QUEUE (provider connected in automation phase) ----------
create table email_queue (
  id                uuid primary key default gen_random_uuid(),
  event_key         text not null,
  recipient         text not null,
  lang              interface_lang not null default 'fr',
  payload           jsonb not null default '{}',
  status            text not null default 'pending'
                    check (status in ('pending','approved','sent','failed','cancelled')),
  requires_approval boolean not null default true,      -- spec §11: staff approval before reminders
  approved_by       uuid references profiles(id),
  attempts          int not null default 0,
  last_error        text,
  scheduled_at      timestamptz default now(),
  sent_at           timestamptz,
  created_at        timestamptz not null default now()
);

-- ---------- AUDIT LOG (append-only) ----------
create table audit_logs (
  id               bigint generated always as identity primary key,
  actor_id         uuid,
  actor_staff_code text,
  actor_role       text,
  action           text not null,
  entity           text,
  entity_id        text,
  old_values       jsonb,
  new_values       jsonb,
  ip               text,
  meta             jsonb,
  created_at       timestamptz not null default now()
);

-- ---------- LOGIN LOCKOUT (5 fails -> 30 min, spec §18) ----------
create table login_security (
  email        text primary key,
  failed_count int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

-- ---------- COMPANY SETTINGS (single row) ----------
create table company_settings (
  id                   boolean primary key default true check (id),
  legal_name           text not null default 'ALMA CONSULTING',
  address_line1        text not null default '[À compléter — adresse légale]',
  city                 text not null default '[Ville]',
  country              text not null default 'Maroc',
  ice                  text not null default '[ICE]',
  tax_id               text not null default '[IF]',
  rc_number            text not null default '[RC]',
  support_email        text not null default 'contact@almaconsulting.ma',
  support_phone        text not null default '[Téléphone]',
  default_currency     text not null default 'MAD',
  package_total        numeric(12,2) not null default 20000.00,
  invoice_due_days     int not null default 15,
  reminder_days_before int not null default 7,
  retention_years      int not null default 10,   -- Q11: files kept/anonymised after 10y
  updated_by           uuid references profiles(id),
  updated_at           timestamptz not null default now()
);

-- ---------- STATUS TRANSITION AUDIT (case history) ----------
create table case_history (
  id          bigint generated always as identity primary key,
  case_id     uuid not null references cases(id) on delete cascade,
  actor_id    uuid,
  actor_staff_code text,
  field       text not null,
  old_value   text,
  new_value   text,
  reason      text,
  created_at  timestamptz not null default now()
);

-- ---------- INDEXES ----------
create index idx_profiles_agency      on profiles(agency_id);
create index idx_students_agency      on students(agency_id);
create index idx_students_agent       on students(main_agent_id);
create index idx_cases_student        on cases(student_id);
create index idx_cases_agency         on cases(agency_id);
create index idx_cases_agent          on cases(agent_id);
create index idx_cases_stage          on cases(stage) where archived = false;
create index idx_checklist_case       on case_checklist_items(case_id);
create index idx_documents_case       on case_documents(case_id);
create index idx_documents_item       on case_documents(checklist_item_id);
create index idx_tasks_assignee       on tasks(assignee);
create index idx_tasks_due            on tasks(due_at);
create index idx_invoices_student     on invoices(student_id);
create index idx_payments_invoice     on payments(invoice_id);
create index idx_payments_status      on payments(status);
create index idx_messages_student     on messages(student_id);
create index idx_audit_entity         on audit_logs(entity, entity_id);
create index idx_audit_actor          on audit_logs(actor_id, created_at);
