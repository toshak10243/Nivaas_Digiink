import { pool } from '../src/db.js';

export async function runMigrations() {
  await pool.query(`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_at timestamptz;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_type text DEFAULT 'call';
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_note text;

    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_visits_status_check') THEN
        ALTER TABLE site_visits DROP CONSTRAINT site_visits_status_check;
      END IF;
    END $$;

    ALTER TABLE site_visits ADD CONSTRAINT site_visits_status_check
      CHECK (status IN ('scheduled','confirmed','done','no_show','cancelled','rescheduled'));

    ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS visitors_count int DEFAULT 1;
    ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS transport text;
    ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS pickup_address text;
    ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS interested_unit text;
    ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS rating int;
    ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS evidence_passport jsonb DEFAULT '{}'::jsonb;

    -- Customer Construction Progress Tracker
    ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS tower_id text;
    ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS stage_name text;
    ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS progress_pct int DEFAULT 0;
    ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS media_urls jsonb DEFAULT '[]'::jsonb;

    -- Digital Buyer Handover Room & AI Registry Day Manager
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS handover_status text DEFAULT 'pending';
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS handover_docs jsonb DEFAULT '{}'::jsonb;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS registry_checklist jsonb DEFAULT '{"pan_verified":false,"aadhar_verified":false,"form_26qb_tds":false,"bank_noc":false,"signatory_assigned":false,"status":"pending"}'::jsonb;

    -- AI Sales Handover Memory
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS handover_summary jsonb DEFAULT '{}'::jsonb;
  `);
  console.log('✓ Database migrations applied');
}

if (process.argv[1]?.endsWith('migrations.js')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Migration error:', err.message);
      process.exit(1);
    });
}

