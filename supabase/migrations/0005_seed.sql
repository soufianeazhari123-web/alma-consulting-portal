-- ============================================================
-- ALMA CONSULTING PLATFORM — 0005: Seed data
-- 10 countries, service types, installment rules (owner-confirmed
-- mapping incl. #4 = visa/TRP appointment booked), settings row,
-- and section-27 checklist templates.
-- NOTE: checklists are operational templates from the owner brief —
-- they must be re-verified against official sources before
-- being presented as legal requirements (spec §8/§20).
-- ============================================================

alter table installment_rules add column if not exists service_scope text not null default 'any';

insert into countries (code, name_fr, name_en, sort_order) values
  ('LT','Lituanie','Lithuania',1),
  ('LV','Lettonie','Latvia',2),
  ('EE','Estonie','Estonia',3),
  ('HU','Hongrie','Hungary',4),
  ('PL','Pologne','Poland',5),
  ('ES','Espagne','Spain',6),
  ('FR','France','France',7),
  ('DE','Allemagne','Germany',8),
  ('BE','Belgique','Belgium',9),
  ('NL','Pays-Bas','Netherlands',10)
on conflict (code) do nothing;

insert into service_types (key, label_fr, label_en) values
  ('university_application','Candidature universitaire','University application'),
  ('visa_trp','Visa / Titre de séjour','Visa / TRP')
on conflict (key) do nothing;

-- Owner-confirmed installment mapping:
-- 1 enrollment, 2 university submission, 3 visa/TRP file approved for submission,
-- 4 visa/TRP appointment booked. Free retake => never invoiced (handled in fn).
insert into installment_rules (id, trigger_stage, service_scope, label_fr, label_en, default_amount) values
  (1,'draft','any','Frais d''inscription (à la signature)','Enrollment fee (at signing)',5000.00),
  (2,'submitted','university_application','2e tranche — dépôt candidature université','Installment 2 — university application submitted',5000.00),
  (3,'approved_for_submission','visa_trp','3e tranche — dossier visa/TRP prêt','Installment 3 — visa/TRP file ready',5000.00),
  (4,'appointment_booked','visa_trp','4e tranche — rendez-vous visa/TRP confirmé','Installment 4 — visa/TRP appointment booked',5000.00)
on conflict (id) do update set trigger_stage=excluded.trigger_stage, service_scope=excluded.service_scope;

insert into company_settings (id) values (true) on conflict (id) do nothing;

-- ------------------------------------------------------------
-- CHECKLIST TEMPLATES (version 1) — from owner brief §27
-- item: name_fr | name_en | required | translation | legalisation | mode
-- ------------------------------------------------------------
do $$
declare
  c record;
  st_uni uuid; st_visa uuid;
  tpl uuid;
  items jsonb;
  it jsonb;
begin
  select id into st_uni from service_types where key='university_application';
  select id into st_visa from service_types where key='visa_trp';

  for c in select id, code from countries order by sort_order loop

    -- ===== UNIVERSITY APPLICATION TEMPLATE =====
    insert into service_templates (country_id, service_type_id, version, status, published_at)
    values (c.id, st_uni, 1, 'published', now())
    returning id into tpl;

    items := '[
      ["Copie du passeport","Passport copy",true,false,false,null],
      ["Reconnaissance / équivalence du diplôme","Diploma recognition/equivalence",true,true,true,"apostille"],
      ["Diplôme (Bac / Licence)","High school / Bachelor diploma",true,true,true,"apostille"],
      ["Traductions officielles","Official translations",true,true,false,"sworn_translation"],
      ["Apostille / légalisation","Apostille / legalisation",true,false,true,"apostille"],
      ["Lettre de motivation","Motivation letter",true,false,false,null],
      ["Photo d''identité","ID photograph",true,false,false,null],
      ["Certificat de langue (B1/B2 ou équivalent)","Language certificate (B1/B2 or equivalent)",true,false,false,null],
      ["Preuve de paiement des frais de candidature","Application fee payment proof",true,false,false,null],
      ["Preuve de paiement des frais de scolarité","Tuition fee payment proof",true,false,false,null],
      ["Lettre d''admission universitaire","University acceptance letter",false,false,false,null]
    ]'::jsonb;

    for it in select * from jsonb_array_elements(items) loop
      insert into document_templates (
        template_id, name_fr, name_en, is_required,
        translation_required, legalisation_required, legalisation_mode, sort_order
      ) values (
        tpl, it->>0, it->>1, (it->>2)::boolean,
        (it->>3)::boolean, (it->>4)::boolean, it->>5
      );
    end loop;
    -- fix ordering (ordinality trick above is not valid in this context; use counter)
    update document_templates dt set sort_order = sub.rn
    from (
      select id, row_number() over (order by created_at) rn
      from document_templates where template_id = tpl
    ) sub where dt.id = sub.id;

    -- ===== VISA / TRP TEMPLATE =====
    insert into service_templates (country_id, service_type_id, version, status, published_at)
    values (c.id, st_visa, 1, 'published', now())
    returning id into tpl;

    items := '[
      ["Passeport valide","Valid passport",true,false,false,null],
      ["Lettre d''admission (originale)","Acceptance letter (original)",true,true,false,null],
      ["Preuve d''hébergement","Proof of accommodation",true,true,true,"apostille"],
      ["Preuve de moyens financiers","Proof of financial means",true,true,true,"apostille"],
      ["Assurance santé / voyage","Health insurance",true,true,false,null],
      ["Formulaire de demande de visa/TRP","Visa/TRP application form",true,false,false,null],
      ["Photo biométrique","Biometric photograph",true,false,false,null],
      ["Reçu des frais de visa","Visa fee payment receipt",true,false,false,null],
      ["Casier judiciaire","Criminal record certificate",true,true,true,"apostille"]
    ]'::jsonb;

    -- country-specific extras
    if c.code in ('LV','HU','ES') then
      items := items || '[["Certificat médical","Medical certificate",true,true,false,null]]'::jsonb;
    end if;
    if c.code = 'DE' then
      items := items || '[["Compte bloqué (Sperrkonto ~11 208€/an) ou prise en charge","Blocked account (~€11,208/yr) or sponsorship declaration",true,true,true,"apostille"]] '::jsonb;
    end if;
    if c.code = 'FR' then
      items := items || '[["Validation OFII (après arrivée)","OFII validation (post-arrival)",false,false,false,null]]'::jsonb;
    end if;
    if c.code = 'DE' then
      items := items || '[["Rendez-vous Bürgeramt (après arrivée)","Bürgeramt registration appointment (post-arrival)",false,false,false,null]]'::jsonb;
    end if;
    if c.code = 'LT' then
      items := items || '[["Preuve de paiement des frais de scolarité","Tuition fee payment proof",true,true,true,"apostille"]] '::jsonb;
    end if;
    if c.code = 'PL' then
      null; -- same as base
    end if;

    for it in select * from jsonb_array_elements(items) loop
      insert into document_templates (
        template_id, name_fr, name_en, is_required,
        translation_required, legalisation_required, legalisation_mode
      ) values (
        tpl, trim(it->>0), it->>1, (it->>2)::boolean,
        (it->>3)::boolean, (it->>4)::boolean, it->>5
      );
    end loop;

    update document_templates dt set sort_order = sub.rn
    from (
      select id, row_number() over (order by created_at, id) rn
      from document_templates where template_id = tpl
    ) sub where dt.id = sub.id;

  end loop;
end $$;
