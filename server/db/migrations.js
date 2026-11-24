import { pool } from '../src/db.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config.js';

function legacyUploadFilename(url, orgId) {
  if (typeof url !== 'string') return null;
  const match = /^\/uploads\/([0-9a-f-]{36})\/([0-9a-f-]{36}\.(?:jpg|png|webp|gif|heic|mp4|mov|webm|pdf))$/i.exec(url);
  return match && match[1] === orgId ? match[2] : null;
}

async function movePrivateFile(orgId, filename) {
  const from = path.join(config.uploadDir, orgId, filename);
  const toDir = path.join(config.uploadDir, 'private', orgId);
  const to = path.join(toDir, filename);
  await fs.mkdir(toDir, { recursive: true });
  try {
    await fs.rename(from, to);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'EEXIST') throw error;
    if (error.code === 'EEXIST') await fs.unlink(from).catch(() => {});
  }
  return `private/${orgId}/${filename}`;
}

async function privatizeLegacyUploads() {
  const ticketFiles = await pool.query(`SELECT f.id, f.url, t.org_id FROM ticket_files f JOIN tickets t ON t.id = f.ticket_id WHERE f.url LIKE '/uploads/%'`);
  for (const row of ticketFiles.rows) {
    const filename = legacyUploadFilename(row.url, row.org_id);
    if (!filename) continue;
    const key = await movePrivateFile(row.org_id, filename);
    await pool.query('UPDATE ticket_files SET url = $2 WHERE id = $1', [row.id, key]);
  }

  const users = await pool.query(`SELECT id, org_id, profile FROM users WHERE profile ? 'avatar_url'`);
  for (const user of users.rows) {
    const filename = legacyUploadFilename(user.profile?.avatar_url, user.org_id);
    if (!filename) continue;
    const avatarPath = await movePrivateFile(user.org_id, filename);
    const profile = { ...user.profile, avatar_path: avatarPath };
    delete profile.avatar_url;
    await pool.query('UPDATE users SET profile = $2 WHERE id = $1', [user.id, JSON.stringify(profile)]);
  }
}

export async function runMigrations() {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

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
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

    -- AI Sales Handover Memory
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS handover_summary jsonb DEFAULT '{}'::jsonb;

    -- Ticket-photo access and internal-comment attachment filtering.
    ALTER TABLE ticket_files ADD COLUMN IF NOT EXISTS comment_id uuid REFERENCES ticket_comments(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS ticket_files_comment ON ticket_files(comment_id);
  `);
  await privatizeLegacyUploads();
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

