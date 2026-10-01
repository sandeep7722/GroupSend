#!/bin/sh
set -eu
# The mounted persistent disk can initially be owned by root. Initialize only
# our fixed subdirectory, then drop privileges before starting the application.
mkdir -p /data/groupsend
chown node:node /data/groupsend
chmod 700 /data/groupsend
exec gosu node xvfb-run -a node cloud/gateway.js
