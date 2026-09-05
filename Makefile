# The whole developer interface. C1's bar is that a new developer reaches a
# working loop from a clean checkout, so every target here is part of that claim.
SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help
COMPOSE := docker compose -f infra/compose.yaml -p manifest

.PHONY: help seed up down reset doctor verify host-setup host-undo

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
