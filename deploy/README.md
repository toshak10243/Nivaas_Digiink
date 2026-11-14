# Checkbox and bulk action release

Live deployment: `root@200.234.46.234`, application `/var/www/nivaas`, PM2 process `nivaas`, domain `https://nivaas.digiinksolutions.com`.

- Leads > List: select rows or all visible leads. Changing filters clears selection.
- Bulk stage updates and follow-up completion respect lead ownership. Transfers and permanent deletion are admin-only; booked leads are protected.
- WhatsApp sends support up to 50 selected leads with an eligible connected conversation. Results show sent and failed recipients; real sends happen only after Send message confirmation.
- Compose email opens the user's email app with BCC recipients; it does not send mail from the server.
- Lead details save preferences and task/document checklists to PostgreSQL. Preferences can be used as filters. Task checkboxes record checklist completion; pipeline and visit status are managed separately.

Validation: from `server`, run `npm run test:checkboxes` against an initialized development database. It creates temporary test organizations and removes them in a finally block. Do not run this test against production. From `client`, run `npm run build`.

Back up source and database before deploying. Keep server/.env and uploads on the VPS. Run `node db/migrations.js` from the server directory, then restart only the `nivaas` PM2 process. Verify `/health` and compare the served JS/CSS hashes with the release build.
