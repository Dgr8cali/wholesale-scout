# Wholesale Scout on the Netcup server (89.58.38.2). From the Mac:
#   make deploy    push must be done first; builds and restarts the app on the server
#   make migrate   apply pending supabase/migrations to the server's database (over an SSH tunnel)
#   make logs      tail the app's logs on the server
SSH = ssh -i $(HOME)/.ssh/kalistudio akin@89.58.38.2

.PHONY: deploy migrate migrate-status logs

deploy:
	@git status --porcelain | grep -q . && { echo "uncommitted changes; commit and push first"; exit 1; } || true
	@[ "$$(git rev-parse HEAD)" = "$$(git rev-parse origin/main)" ] || { echo "local main is not pushed (git push origin main)"; exit 1; }
	$(SSH) 'cd ~/wholesale-scout && ./infra/deploy.sh'

# The server's Postgres listens on its own localhost only, so open a tunnel: Mac :5433 -> server :5432.
migrate:
	@$(SSH) -f -N -L 5433:127.0.0.1:5432 -o ExitOnForwardFailure=yes && sleep 1; \
	node --env-file-if-exists=.env.local scripts/migrate.mjs; rc=$$?; \
	pkill -f 'ssh.*5433:127.0.0.1:5432' || true; exit $$rc

migrate-status:
	@$(SSH) -f -N -L 5433:127.0.0.1:5432 -o ExitOnForwardFailure=yes && sleep 1; \
	node --env-file-if-exists=.env.local scripts/migrate.mjs --status; rc=$$?; \
	pkill -f 'ssh.*5433:127.0.0.1:5432' || true; exit $$rc

logs:
	$(SSH) 'cd ~/wholesale-scout && docker compose -f infra/docker-compose.yml logs -f --tail=100 app'
