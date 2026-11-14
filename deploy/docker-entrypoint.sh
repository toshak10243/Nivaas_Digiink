#!/bin/sh
set -eu

mkdir -p /data/uploads
find /data/uploads -type d -exec chown nivaas:nivaas {} +
exec su-exec nivaas "$@"
