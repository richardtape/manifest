# The whole developer interface. C1's bar is that a new developer reaches a
# working loop from a clean checkout, so every target here is part of that claim.
SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help
# --env-file is required: Compose resolves a bare `.env` against the compose
# file's directory (infra/), not the repo root. See infra/lib/common.sh.
#
# LITELLM_DIGEST is read from infra/images.lock and passed in the ENVIRONMENT,
# which Compose resolves ahead of --env-file. Deliberately not written into
# .env: images.lock is already the one place digests live (`make seed` writes
# it), and a copy in .env would be a second source that drifts the first time
# somebody re-seeds without re-running this. Empty until `make seed` has run,
# and compose.yaml's `:?` then says so by name.
LITELLM_DIGEST := $(shell awk '$$1 ~ /berriai\/litellm/ {print $$2}' infra/images.lock 2>/dev/null || true)
# See infra/lib/common.sh for why the fallback is a digest that cannot exist.
LITELLM_DIGEST := $(or $(LITELLM_DIGEST),sha256:0000000000000000000000000000000000000000000000000000000000000000)
COMPOSE := LITELLM_DIGEST=$(LITELLM_DIGEST) docker compose -f infra/compose.yaml -p manifest --env-file .env

.PHONY: help seed up down reset doctor verify demo demo-identity demo-ai demo-redeploy demo-journey demo-token demo-console ci-acceptance host-setup host-undo

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
	@bash infra/lib/ensure-idp-keypair.sh
	@bash infra/lib/ensure-cp-sp-keypair.sh
	@bash infra/lib/ensure-master-key.sh
	@$(COMPOSE) up -d --wait
	@bash infra/lib/ensure-caddy-config.sh
	@bash infra/lib/ensure-idp-sql.sh
	@bash infra/lib/ensure-app-role.sh
	@echo
	@echo "  platform up. Next: make doctor && make verify"
	@echo "  edge: https://edge.manifest.internal/   console and API: https://console.manifest.internal/v1/"

down:  ## Stop everything. Data, seed cache and CA survive.
	@$(COMPOSE) down

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
	@$(COMPOSE) down
	@docker volume rm -f manifest-pgdata manifest-registry-data manifest-buildkit-cache 2>/dev/null || true
# Per-app resources. `mf-` is ours and per-app; `manifest-` is the platform's;
# everything else on this machine belongs to somebody else and is NEVER touched —
# `docker-simple-saml-saml-idp-1`, `qdrant-local-dev`, `mongodb` and
# `mongo-express` in particular. `make verify` asserts all four are still present
# afterwards, because a typo in the filter below would remove somebody's work and
# nothing else would notice.
#
# The filter is Docker's `name=^mf-`, not a `grep`, and `-I{}` gives ONE
# invocation per resource so a single stubborn container does not abandon the
# rest. NO `xargs -r`: it is GNU-only and BSD xargs already handles empty input.
# `-v` REMOVES THE CONTAINER'S ANONYMOUS VOLUMES with it. Without it this target
# is itself a source of defect 24's leak, which the driver was fixed for in Task 6:
# `mongodb/mongodb-community-server` declares BOTH `/data/db` and `/data/configdb`
# as VOLUMEs and only the first is bound to a named one, so every service container
# removed without `-v` orphans an anonymous volume. Measured 2026-09-07: six left
# behind by this session's resets. The named `mf-…-data` volumes are removed
# separately below, deliberately — that is D3's data and its removal is the
# `reset` verb's whole point.
	@docker ps -aq --filter 'name=^mf-' | xargs -I{} docker rm -f -v {} 2>/dev/null || true
# DISCONNECT THE PLATFORM NEIGHBOURS FIRST. `ensureAppNetwork` attaches
# manifest-caddy and manifest-dns-containers to every app network by design (the
# edge is the only thing that can reach an app, and an --internal network cannot
# forward a DNS query off itself), so `docker network rm` fails with "has active
# endpoints" while they are up. This target happens to work anyway because
# `down` runs above and stops them — but that makes correctness an accident of
# ordering, and the `|| true` below would hide the failure completely. Measured
# 2026-09-07: five app networks survived a cleanup that reported success.
	@for n in $$(docker network ls --format '{{.Name}}' | grep '^mf-'); do 	  for c in $$(docker network inspect $$n --format '{{range .Containers}}{{.Name}} {{end}}'); do 	    docker network disconnect -f $$n $$c 2>/dev/null || true; 	  done; 	done
	@docker network ls -q --filter 'name=^mf-' | xargs -I{} docker network rm {} 2>/dev/null || true
	@docker volume ls -q --filter 'name=^mf-' | xargs -I{} docker volume rm -f {} 2>/dev/null || true
	@echo "  re-mirroring base images into the fresh registry (no network needed)"
	@$(COMPOSE) up -d --wait registry >/dev/null
	@bash infra/seed/mirror-images.sh
	@echo "reset done. THE DATABASE IS EMPTY: re-apply migrations before \`pnpm test\`"
	@echo "  or the control plane — README's 'Running the control plane' has the command."
	@echo "infra/secrets/master.key was NOT removed — every stored secret is sealed"
	@echo "to it, so destroying it is not a reset (§20, separate custody)."
	@echo "manifest-caddy-data was NOT removed — the trusted CA lives there,"
	@echo "and the mirrored base images are back, so the machine is still offline-capable."
	@echo "Run: make up"

demo: up  ## P3's acceptance: the fixture app from a bare repo to a healthy URL.
	@bash scripts/demo.sh

demo-identity: up  ## P4a's acceptance: a real CWL login, and a note one person cannot see.
	@bash scripts/demo-identity.sh

demo-ai: up  ## P4b's acceptance: the proof app answers a question, charged to one person.
	@bash scripts/demo-ai.sh

demo-redeploy: up  ## P4c's acceptance: a redeploy nobody using the app notices.
	@bash scripts/demo-redeploy.sh

demo-journey: up  ## P5a's acceptance: §22's journey through the edge, by nothing but the generated client.
	@bash scripts/demo-journey.sh

demo-token: up  ## P5b's acceptance: an agent runs the build loop on a delegated token, and a human answers it.
	@bash scripts/demo-token.sh

demo-console: up  ## P5c: serve the reference console and print the checklist a person clicks.
	@bash scripts/demo-console.sh

ci-acceptance: up  ## 1c's acceptance, headless: the gates with their counts, and both journeys.
	@bash scripts/ci-acceptance.sh

host-setup:  ## The three privileged steps. Prompts for a password.
	@sudo bash infra/host/host-setup.sh

host-undo:  ## Reverse every host change. Leaves Valet untouched.
	@sudo bash infra/host/host-undo.sh
