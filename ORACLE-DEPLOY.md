# Oracle deployment: same GroupSend app

## 1. Push the updated files

Upload the updated package contents to the same GitHub repository and commit/push. Keep `compose.oracle.yaml` at repository root alongside `package.json`. Do not upload `.oracle.env`, local login files or WhatsApp session folders. The existing local/Render code is shared; Oracle adds deployment configuration only.

## 2. Create a free server

In Oracle Cloud Console, choose your home region, then **Compute > Instances > Create instance**.

- Name: `groupsend`.
- Image: Canonical Ubuntu 24.04, ARM-compatible when selecting Ampere.
- Shape: **VM.Standard.A1.Flex**, Always Free eligible. For a small pilot, use **2 OCPUs and 6 GB RAM**, only if your console confirms this is within your available free allocation. Current documentation lists a combined Always Free A1 allowance of 2 OCPUs/12 GB; do not allocate it again if another VM already uses it.
- Boot disk: default approximately 50 GB, within the combined free storage allowance.
- Networking: public subnet, public IPv4, Internet Gateway route.
- Generate/download SSH keys and keep the private key safe. Create the instance and note its public IP.

If capacity is unavailable, try another availability domain in your home region or wait. Do not select a paid shape just to bypass the capacity error. Always Free resources may be reclaimed when idle; free hosting is not guaranteed uptime. Review Oracle's displayed estimate and eligibility before creating resources.

Official instructions: https://docs.oracle.com/en-us/iaas/Content/Compute/tutorials/first-linux-instance/overview.htm
Free limits: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm

## 3. Network and free hostname

In the instance's subnet Security List or attached Network Security Group, add **stateful ingress** rules:

| Source | Protocol | Destination port |
|---|---|---|
| Your current public IP followed by /32 | TCP | 22 |
| 0.0.0.0/0 | TCP | 80 |
| 0.0.0.0/0 | TCP | 443 |

Keep normal outbound internet access for Docker downloads, certificates and WhatsApp. Do not expose port 10000 or worker ports. If the Ubuntu host has additional firewall restrictions, allow the web traffic there too; do not flush firewall rules. Docker publishes the web ports through its own firewall rules, and OCI's network rules still apply.

At https://www.duckdns.org/ sign in, create a free name such as `yourgroups.duckdns.org`, and set its IPv4 to the Oracle server's public IP. Leave IPv6 unset unless configured. Verify DNS points to the server before starting HTTPS. A custom domain works too with an A record pointing to the same IP. If the server IP changes, update DNS.

## 4. Connect and install Docker

In Windows PowerShell, replace the example path and IP:

```powershell
ssh -i "C:\path\to\your-private-key.key" ubuntu@YOUR_SERVER_IP
```

On the Ubuntu server, install Docker Engine and Compose using Docker's official Ubuntu apt-repository instructions (supports ARM64): https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository

Verify and install the remaining small utilities:

```bash
sudo docker run --rm hello-world
sudo docker compose version
sudo apt update
sudo apt install -y git openssl
```

## 5. Download your app and configure it

Replace the repository URL with your own:

```bash
git clone https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git groupsend
cd groupsend
bash cloud/configure-oracle.sh
```

For a private repository, use a GitHub read-only deploy key or a fine-grained token scoped to that repository when Git asks for credentials. A GitHub account password does not work for cloning; do not put tokens in the URL or this chat.

The setup asks for your hostname and owner email. It generates and displays a new password; save it privately. This will be your Oracle app login. Local demo credentials are separate. The settings file is never overwritten by running setup again.

## 6. Build and launch

Run from the `groupsend` folder:

```bash
sudo docker compose --env-file .oracle.env -p groupsend-oracle -f compose.oracle.yaml config --quiet
sudo docker compose --env-file .oracle.env -p groupsend-oracle -f compose.oracle.yaml up --build -d
sudo docker compose --env-file .oracle.env -p groupsend-oracle -f compose.oracle.yaml ps
sudo docker compose --env-file .oracle.env -p groupsend-oracle -f compose.oracle.yaml logs --tail=100
```

Caddy obtains HTTPS automatically once the hostname resolves and ports 80/443 are reachable. Open **https://YOUR-HOSTNAME**, sign in, link WhatsApp, and verify a permitted test-group send and Disconnect before inviting users. Website health alone does not prove WhatsApp linking works.

After successful owner creation you may remove OWNER_EMAIL and OWNER_PASSWORD lines from `.oracle.env` and run the `up -d` command again (without `--build`); the saved account persists. Keep DOMAIN. Changing owner variables does not reset an existing account.

## Updates, logs and data

For a code fix, test locally, commit/push to GitHub, then on the server run `git pull --ff-only` and repeat the build/start command from step 6. Finish active sends before restarting.

Accounts and WhatsApp sessions live in the `oracle_app_data` named Docker volume; certificate data lives in separate named volumes. Do not run `down -v` or delete these volumes. Keep private backups of the server/app data, and test restoration. Restarting ends website login sessions; saved WhatsApp profiles remain, but you may need to click Connect again.

The pilot permits 2 active workspaces. This is not a tested throughput guarantee; observe memory before increasing limits. Sign out ends the website session, while Disconnect unlinks WhatsApp.

## Local reproduction

Normal Windows use still works with **Start GroupSend Accounts.cmd**. For a closer Oracle browser/container test, first run **Start Render Test Locally.cmd** once to create `.local-docker.env`, then stop that container before switching:

```powershell
docker compose -p groupsend-render-test -f compose.local.yaml stop
docker compose -p groupsend-oracle-test -f compose.local.yaml -f compose.oracle-test.yaml up --build -d --wait
```

Open http://localhost:4322. Login uses `.local-docker.env`; the Oracle-test volume is separate from both Render-test and live Oracle data. Docker Desktop needs enough assigned RAM for the 6 GB test limit. Use the same two compose files and project name with `logs --tail=100` or `stop` to inspect/stop it. Stop Oracle-test before restarting Render-test because they share the local port.

Oracle A1 is ARM64, while most Windows laptops run AMD64; the same Dockerfile builds native packages for each. This does not reproduce Oracle's CPU architecture, network/IP or TLS environment exactly. Compare `/health` revision values to check app-source parity.

## Verification and isolation

The Oracle deployment uses the same Dockerfile and app entrypoint as Render, with VPS browser mode enabling Chromium's sandbox. Its container receives SYS_ADMIN for sandbox support, runs the app as a non-root user, and exposes only the HTTPS proxy. This broad capability is a tradeoff: use a dedicated VM, not a shared host for unrelated sensitive services.

Automated app tests pass, but Docker, Oracle ARM image build, sandbox startup, HTTPS and actual WhatsApp pairing/sending have not been run in this development environment. If the sandbox fails, collect logs instead of silently disabling it. The unofficial WhatsApp integration can be rejected by WhatsApp even if the website deploys successfully.

HTTPS reference: https://caddyserver.com/docs/automatic-https
