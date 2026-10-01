# GroupSend: Render aur local use

## One app, local and Render

Both environments use the same login, frontend, gateway, WhatsApp worker and sending code in this folder. There is no separate copy of the app to maintain. Make fixes here, test locally, then deploy the same Git commit on Render.

**For troubleshooting Render issues, use `Start Render Test Locally.cmd`.** Install and start Docker Desktop with Linux containers first. The launcher builds `cloud/Dockerfile.render`, exactly the Dockerfile and entrypoint selected by `render.yaml`, and opens **http://localhost:4322/login**. Login details open in Notepad. This matches Linux, the Chromium launch options, server-side virtual display and the default pilot workspace/resource limits. It does not use your Windows Chrome installation.

The simpler `Start GroupSend Accounts.cmd` remains available at port 4321 without Docker. It uses the same app code but runs on Windows with installed Chrome, so it is useful for everyday testing but is less representative of Render browser issues.

Local Docker, local Windows and Render each keep their own accounts and WhatsApp sessions. They do not automatically synchronize. Connect WhatsApp separately; avoid running the same test send in both environments. Never copy a live WhatsApp profile between them.

### Reproduce and deploy a fix

1. Stop any active test sends before rebuilding. Change the source files in this folder.
2. Run `Start Render Test Locally.cmd` again. It rebuilds the container from the edited source and keeps the local Docker data volume.
3. Test login, linking, groups, send receipt and Disconnect using your test group.
4. Commit those same changes and deploy that commit on Render.
5. Compare `revision` from `http://localhost:4322/health` and `https://YOUR-RENDER-ADDRESS/health`. Matching values mean the application source and dependency lockfile match. This does not guarantee identical downloaded OS/browser packages or hosting behavior.

Render still differs in its public HTTPS proxy, network/IP, storage and host restrictions. Docker reproduces the application/container setup; cloud-only WhatsApp linking problems can still require testing on Render itself. Docker base/browser packages are downloaded at build time, so builds performed on different dates can resolve different versions.

Local Docker troubleshooting, run from this folder:

```powershell
docker compose -p groupsend-render-test -f compose.local.yaml logs --tail=100
docker compose -p groupsend-render-test -f compose.local.yaml stop
```

The first command shows logs; the second stops local testing. Do not add `-v` to a `down` command: it removes saved test accounts/sessions. The file `.local-docker.env` holds local test credentials and is excluded from Git and Docker builds. Do not upload it. This Docker mode has not been executed here because Docker is not installed; the launcher reports that prerequisite instead of pretending to run it.

## Local laptop par test karein

1. ZIP ko extract karein. Node.js 24 LTS aur Google Chrome installed hone chahiye.
2. **Start GroupSend Accounts.cmd** par File Explorer se double-click karein.
3. Pehli baar dependencies install ho sakti hain. Browser mein **http://localhost:4321/login** khulega; Notepad mein email/password khulenge. Har fresh installation ka password alag generate hota hai.
4. Wahi details se login karein. Connect WhatsApp, QR scan, groups select, phir apne test group mein message bhejein.
5. Dobara app kholne ke liye wahi launcher use karein. Credentials `.local-cloud/demo-login.txt` mein rahenge. Is file ko private rakhein.

The accounts app runs on port 4321. The old preview on port 4320 has separate credentials. Use the login file opened by the current launcher.

Local app laptop band hone par band ho jayega. Local use ke liye Render ya domain ki zaroorat nahi. Launcher ko Windows File Explorer se chalayein: restricted coding environment se start karne par Windows browser/worker launch ko `spawn EPERM` se block kar sakta hai.

## Render par deploy karein

1. Is package ke contents ko ek **private GitHub repository** mein upload karein. Repository root mein `render.yaml`, `package.json`, `public` aur `cloud` hone chahiye. `.local-cloud`, `.data`, `node_modules`, `.env` ya login files upload na karein; `.gitignore` included hai.
2. Render mein **New > Blueprint** kholein aur repository connect karein. Root ka `render.yaml` use karein. Ye paid web service aur persistent disk create karega; Render ke checkout par cost dekhkar hi confirm karein.
3. Setup mein **OWNER_EMAIL** aur **OWNER_PASSWORD** apne chun kar fill karein. Password 12–128 characters ka ho. Local demo login online par automatically nahi aayega.
4. Deploy karein. Render ka `https://...onrender.com` URL kholein aur apne owner account se login karein. Custom domain kharidna zaroori nahi.
5. WhatsApp connect karke test group mein ek message verify karein. Disconnect ko bhi phone ke Linked devices mein verify karein. Uske baad invite link se doosre users ko register karayein.

### Included configuration

- Dockerfile: `cloud/Dockerfile.render`; build context: repository root.
- Health check: `/health`. Render ka PORT aur RENDER_EXTERNAL_URL automatically use hote hain.
- Persistent disk: `/data`, 5 GB. Accounts/WhatsApp data: `/data/groupsend`. Disk ko delete karne par logins aur saved data bhi jayega.
- Single instance, 1 CPU / 2 GB pilot configuration. `MAX_WORKSPACES=1` initially limits live workspaces to one; registered account limit 30 is not a simultaneous-connection promise. Multiple concurrent users need more memory and a tested higher workspace limit. A disconnected unused workspace frees its slot after about 10 minutes; close its page to stop polling.
- Render handles public HTTPS. No Caddy service, custom domain, or SYS_ADMIN capability is requested by this Render configuration.
- Initial owner is created only when accounts storage is empty. After successful setup, remove OWNER_PASSWORD and OWNER_EMAIL from Render environment settings and redeploy; the existing account remains on disk. Changing these variables does not reset an existing password.
- Custom domain later: add it in Render and set PUBLIC_ORIGIN to its exact HTTPS origin. Use that one canonical address for sign-in.

### Browser isolation tradeoff

The Render-specific browser runs as non-root, but Chromium's own sandbox is disabled (`--no-sandbox`) to avoid requiring the VPS SYS_ADMIN configuration. This reduces isolation between the browser and application inside the container. User profiles/processes are separate, but are not strong tenant security boundaries against a compromised browser. Start with trusted users and a small private pilot. For stronger isolation, a deployment with Chromium sandbox support is needed. Local Windows Chrome keeps its normal sandbox settings.

This is an unofficial WhatsApp integration; successful deployment does not guarantee WhatsApp will accept cloud linking. It must be tested from the actual Render service. If linking fails, keep the local version available and inspect the deployment logs before inviting users.

## What was verified

24 automated checks passed: credentials/bootstrap persistence, Render URL/port configuration, account routing and isolation boundaries, CSRF, per-user process configuration, queue deduplication, sending receipts and disconnect behavior. PowerShell launcher syntax was checked.

The real local account service was started and its login, owner identity and authenticated dashboard response were checked successfully, then the test process was stopped. Start the app from the Windows launcher for actual WhatsApp use.

Docker is not installed in the current test environment. The Render image build, Render Blueprint acceptance, actual cloud QR linking/sending and the Windows launcher browser-opening flow still need an end-to-end run on their destination machines. Unit tests do not establish live WhatsApp delivery.

## Test checklist

- Local: launch from File Explorer, login, scan QR, load groups, send to your test group, verify receipt in WhatsApp, disconnect.
- Render: repeat on its HTTPS link, then open that link on phone with laptop off.
- Two users: use two browser profiles and separate app accounts/WhatsApp numbers; confirm groups/history stay separate. Increase capacity only after provisioning enough memory.
- Restart with no send in progress; confirm app login and WhatsApp restoration. Uncertain messages are never automatically resent.
- Sign out ends the website session; Disconnect unlinks WhatsApp. Use Disconnect first if both should end.

Official references: [Render Blueprints](https://render.com/docs/blueprint-spec), [persistent disks](https://render.com/docs/disks), [environment variables](https://render.com/docs/environment-variables), [Docker on Render](https://render.com/docs/docker).
