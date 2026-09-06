# The whole developer interface. C1's bar is that a new developer reaches a
# working loop from a clean checkout, so every target here is part of that claim.
SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help
# --env-file is required: Compose resolves a bare `.env` against the compose
# file's directory (infra/), not the repo root. See infra/lib/common.sh.
COMPOSE := docker compose -f infra/compose.yaml -p manifest --env-file .env

.PHONY: help seed up down reset doctor verify host-setup host-undo

# Every compose target needs .env to exist — `--env-file` on a missing file is a
# hard error, not a warning. `make seed` also writes it; this makes `make up` on
# a fresh clone explain itself instead of failing inside Compose.
.env:
	@cp .env.example .env && echo "created .env from .env.example"

help:  ## Show this help
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

seed: .env  ## The only step needing network. Run once, then work offline.
	@bash infra/seed/seed.sh

doctor:  ## Can this machine run the platform? Works with nothing up.
	@bash scripts/doctor.sh

verify:  ## Is the running platform correct? Needs `make up` first.
	@bash scripts/verify.sh

up: .env  ## Boot the platform. Works offline after `make seed`.
	@bash infra/lib/ensure-alias.sh
	@bash infra/lib/ensure-registry-auth.sh
	@$(COMPOSE) up -d --wait
	@echo
	@echo "  platform up. Next: make doctor && make verify"
	@echo "  edge: https://console.manifest.internal/"

down:  ## Stop everything, including the profiled builder. Data, seed cache and CA survive.
	@$(COMPOSE) --profile build down

# manifest-verdaccio-storage is deliberately NOT destroyed, for the same reason
# manifest-caddy-data is not: it is seed output, not project state. Its config
# says "cache: true IS the offline story", and re-warming it needs the network,
# so wiping it would make `make reset` quietly break C1's offline claim.
# The registry IS wiped because it also holds per-app images; the base images
# are pushed back afterwards from the daemon, which needs no network.
reset: .env  ## Destroy projects, volumes and registry contents. KEEPS the seed cache and the CA.
	@echo "This destroys all project data, the registry contents and the databases."
	@echo "It KEEPS infra/images.lock, the Ollama models, the npm mirror cache and the Caddy CA."
	@read -p "Type 'reset' to continue: " ans; [ "$$ans" = reset ] || exit 1
	@$(COMPOSE) --profile build down
	@docker volume rm -f manifest-pgdata manifest-registry-data manifest-buildkit-cache 2>/dev/null || true
	@docker ps -aq --filter 'name=^mf-' | xargs docker rm -f 2>/dev/null || true
	@docker network ls -q --filter 'name=^mf-' | xargs docker network rm 2>/dev/null || true
	@docker volume ls -q --filter 'name=^mf-' | xargs docker volume rm 2>/dev/null || true
	@echo "  re-mirroring base images into the fresh registry (no network needed)"
	@$(COMPOSE) up -d --wait registry >/dev/null
	@bash infra/seed/mirror-images.sh
	@echo "reset done. manifest-caddy-data was NOT removed — the trusted CA lives there,"
	@echo "and the mirrored base images are back, so the machine is still offline-capable."
	@echo "Run: make up"

host-setup:  ## The three privileged steps. Prompts for a password.
	@sudo bash infra/host/host-setup.sh

host-undo:  ## Reverse every host change. Leaves Valet untouched.
	@sudo bash infra/host/host-undo.sh
