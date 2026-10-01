#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -e .oracle.env ]]; then echo '.oracle.env already exists; keeping your settings.'; exit 0; fi
read -r -p 'App hostname (example: mygroups.duckdns.org): ' app_domain
read -r -p 'Owner email: ' owner_email
if [[ ! "$app_domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$ ]]; then echo 'Enter a hostname only, without https:// or a slash.'; exit 1; fi
if [[ ! "$owner_email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then echo 'Enter a valid email.'; exit 1; fi
owner_password=$(openssl rand -hex 18)
umask 077
printf 'DOMAIN=%s\nOWNER_EMAIL=%s\nOWNER_PASSWORD=%s\n' "$app_domain" "$owner_email" "$owner_password" > .oracle.env
printf '\nSave these private login details:\nEmail: %s\nPassword: %s\nApp: https://%s\n' "$owner_email" "$owner_password" "$app_domain"
echo 'Settings saved in .oracle.env. Do not upload this file to GitHub.'
