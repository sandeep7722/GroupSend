# GroupSend

One account-based app for local use and Render deployment.

- **Windows:** double-click `Start GroupSend Accounts.cmd`. The app opens on http://localhost:4321; generated login details open in Notepad.
- **Render-like local testing:** start Docker Desktop with Linux containers, then double-click `Start Render Test Locally.cmd`. The same Dockerfile used on Render runs on http://localhost:4322.
- **Render:** deploy `render.yaml` from your private repository. Set your owner email/password during setup.

Read **RENDER-AND-LOCAL.md** for installation, troubleshooting, data separation and deployment limits.

Both launchers use the same frontend, authentication, gateway and WhatsApp worker. Keep `server.js`: it is the shared per-user WhatsApp worker, not a duplicate app.

Run checks with `npm test`. Node.js 24 is used by the deployment container.

Saved accounts, sessions, dependencies and caches are not distributed in the ZIP. Do not upload `.data`, `.local-cloud`, `.local-docker.env` or other private session files.

This uses an unofficial WhatsApp integration. Test linking and message delivery with a permitted test group before inviting users. Docker/Render execution has not been verified in this development environment.
