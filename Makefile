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

doctor:  ## Can this machine run the platform? Works with nothing up.
	@bash scripts/doctor.sh

verify:  ## Is the running platform correct? Needs `make up` first.
	@bash scripts/verify.sh

host-setup:  ## The three privileged steps. Prompts for a password.
	@sudo bash infra/host/host-setup.sh

host-undo:  ## Reverse every host change. Leaves Valet untouched.
	@sudo bash infra/host/host-undo.sh
