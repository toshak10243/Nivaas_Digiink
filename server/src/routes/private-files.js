import { Router } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';
import { one } from '../db.js';

const r = Router();

export function signPrivateUrl(kind, id, orgId, expiresInSeconds = 86400 * 7) {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${kind}:${id}:${orgId}:${exp}`;
  const sig = crypto.createHmac('sha256', config.jwtSecret).update(payload).digest('hex');
  return `/private-files/${kind}/${id}?exp=${exp}&sig=${sig}&org=${orgId}`;
}

export function privateFileUrl(kind, id, viewer) {
  const orgId = viewer?.org || '';
  return signPrivateUrl(kind, id, orgId);
}

function verifySignature(kind, id, org, exp, sig) {
  if (!exp || !sig || !org) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const payload = `${kind}:${id}:${org}:${exp}`;
  const expectedSig = crypto.createHmac('sha256', config.jwtSecret).update(payload).digest('hex');
  if (sig.length !== expectedSig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'));
}

r.get('/:kind/:id', async (req, res) => {
  const { kind, id } = req.params;
  const { exp, sig, org } = req.query;

  try {
    if (!verifySignature(kind, id, org, exp, sig)) {
      return res.status(404).send('Not found');
    }

    let relPath = null;
    if (kind === 'avatars') {
      const u = await one(`SELECT profile FROM users WHERE id = $1`, [id]);
      relPath = u?.profile?.avatar_path;
    } else if (kind === 'tickets') {
      const f = await one(`SELECT url FROM ticket_files WHERE id = $1`, [id]);
      relPath = f?.url;
    } else if (kind === 'booking-documents') {
      const document = await one(`SELECT storage_key FROM booking_documents WHERE id = $1 AND org_id = $2`, [id, org]);
      relPath = document?.storage_key;
    }

    if (!relPath) {
      return res.status(404).send('Not found');
    }

    const fullPath = path.resolve(config.uploadDir, relPath);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      return res.status(404).send('Not found');
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    return res.sendFile(fullPath);
  } catch (err) {
    console.error('[private-files error]', err);
    return res.status(404).send('Not found');
  }
});

export default r;
