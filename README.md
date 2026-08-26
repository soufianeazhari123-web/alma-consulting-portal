# ALMA CONSULTING — Plateforme interne & portail étudiant

Stack imposée par le propriétaire : **Netlify (hébergement) + Supabase (base de données, auth, stockage)**.
Toutes les permissions sont appliquées **côté serveur** (RLS PostgreSQL + fonctions RPC) — jamais seulement dans l'interface.

---

## 1. Créer le projet Supabase (~10 min)

1. Aller sur https://supabase.com → **Start your project** → créer un compte.
2. **New project** : nom `alma-consulting`, choisir une région proche (ex. `eu-west` / Paris), définir un mot de passe base de données (le sauvegarder).
3. Une fois créé : **Project Settings → API**. Noter :
   - `Project URL`
   - `anon public` key
   - `service_role` key (**SECRÈTE** — jamais dans le navigateur)

## 2. Installer le schéma de base de données

Dans Supabase : icône **SQL Editor** → **New query**.
Exécuter **dans l'ordre**, un fichier à la fois (contenu de `supabase/migrations/`) :

| Ordre | Fichier | Contenu |
|---|---|---|
| 1 | `0001_schema.sql` | Tables, enums, contraintes |
| 2 | `0002_functions.sql` | Bootstrap ALMA-0001, facturation, paiements, workflows, audit |
| 3 | `0003_rls.sql` | Politiques de sécurité par rôle/agence |
| 4 | `0004_storage.sql` | Bucket privé des documents |
| 5 | `0005_seed.sql` | 10 pays + checklists §27 + tranches + réglages |
| 6 | `0006_staff_code.sql` | Séquence matricules |
| 7 | `0007_invoice1_agreement.sql` | Facture #1 à la convention signée + rappels + ajustements audités |
| 8 | `0008_portal_uploads.sql` | Téléversement des documents par l'étudiant |

Chaque exécution doit se terminer par « Success. No rows returned ».

## 3. Déployer sur Netlify

1. Pousser ce dossier sur GitHub (ou utiliser drag & drop via Netlify CLI — recommander Git pour les fonctions).
2. Netlify → **Add new site → Import an existing project** → choisir le dépôt.
3. Build command : `npm run build` · Publish directory : `dist` (déjà dans `netlify.toml`).
4. **Site configuration → Environment variables** :

   | Variable | Valeur | Visible navigateur ? |
   |---|---|---|
   | `VITE_SUPABASE_URL` | Project URL | oui |
   | `VITE_SUPABASE_ANON_KEY` | anon key | oui |
   | `SUPABASE_URL` | Project URL | non |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **NON — serveur uniquement** |

5. **Deploys → Trigger deploy**.

## 4. Premier lancement

1. **Supabase → Authentication → Providers → Email** : désactiver « Confirm email »
   (sinon le propriétaire devra confirmer son adresse avant la première connexion).
2. Ouvrir `https://VOTRE-SITE.netlify.app/setup`
3. Créer LE compte propriétaire → il devient **Super Admin ALMA-0001** (définitif, unique).
   Il devra immédiatement enroll un code TOTP (MFA obligatoire pour le propriétaire et les directeurs).
4. Une fois le propriétaire créé : revenir dans **Authentication → Settings** et
   **désactiver « Allow new users to sign up »** (les futurs comptes passent uniquement
   par l'invitation des directeurs/du propriétaire).
5. Se connecter sur `/login`.
6. Créer les agences (Oujda, Nador…) → Team & Agencies.
7. Créer directeurs/agents (mot de passe temporaire à remettre en main propre).
8. Compléter Paramètres société (ICE, IF, RC…) avant la première vraie facture.

## 5. Règles métier intégrées au code

- 4 tranches × 5 000 MAD ; facture #4 déclenchée à la confirmation du rendez-vous visa/TRP.
- **Refus visa/TRP → 2ᵉ tentative gratuite** dans n'importe quel pays/service : aucun invoice émis (`create_free_retake`).
- Paiement espèces/virement → **en attente** → vérification directeur → **reçu officiel numéroté** automatique.
- Numérotation gapless par agence : `OUJ-FAC-2026-0001` / `OUJ-REC-2026-0001` (séquence PostgreSQL verrouillée).
- Verrouillage connexion : 5 échecs → 30 min (table `login_security` + RPC).
- Chaque dossier = checklist indépendante copiée du modèle publié (version figée).
- Documents : bucket privé, PDF/JPG/PNG ≤ 10 Mo, versions supersédées, jamais publiques.

## 6. Développement local

```bash
npm install
cp .env.example .env   # remplir avec URL + clé anon
npm run dev
```

## 7. Sauvegardes (décision propriétaire Q29)

- **Quotidien** : activer les backups automatiques Supabase
  (Database → Backups ; inclus selon le plan, rétention 7 jours).
- **Mensuel manuel (recommandé au démarrage)** : exporter un dump complet :
  ```bash
  # une fois : npm i -g supabase
  supabase db dump --db-url "$SUPABASE_DB_URL" -f backup-AAAA-MM-JJ.sql
  ```
  Conserver au moins 3 mois, hors du portable de travail.
- **Documents étudiants** : bucket privé `case-documents` — procédure de
  sauvegarde dédiée à scripter en phase 2.
- Avant production : **tester une restauration** sur un projet Supabase jetable.
- Migration PITR (~100 $/mois) possible plus tard sans changer le code.

## 8. À faire avant production (phases suivantes)

- [ ] Vérifier les checklists officielles pays par pays (sources datées, validation propriétaire)
- [ ] Connecter le fournisseur email (file `email_queue` déjà prête)
- [ ] Scan antivirus des uploads (API tierce)
- [ ] MFA : obligatoire SA + directeurs — fait ; l'activer aussi pour les agents plus tard si souhaité
