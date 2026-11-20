#!/bin/sh
set -e
npm run db:migrate
npm run db:seed
npm run build
exec npx next start -H 0.0.0.0 -p 3000
