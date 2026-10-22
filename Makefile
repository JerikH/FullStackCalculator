export PATH := $(CURDIR)/bin:$(HOME)/.local/go/bin:$(PATH)
SHELL := bash
.SHELLFLAGS := -euo pipefail -c
.DEFAULT_GOAL := help

COMPOSE_PROJECT_NAME ?= fullstackcalculator
WEB_PORT ?= 8080
# Always derived from WEB_PORT (also when the environment exports E2E_BASE_URL for another port); override on the command line.
E2E_BASE_URL := http://127.0.0.1:$(WEB_PORT)
E2E_ARGS ?=
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
COMMIT ?= $(shell git rev-parse HEAD 2>/dev/null || echo unknown)
# The main checkout uses the documented tag; a worker's project name keeps sessions' images apart.
IMAGE_TAG ?= $(if $(filter fullstackcalculator,$(COMPOSE_PROJECT_NAME)),local,$(COMPOSE_PROJECT_NAME))
AIO_IMAGE ?= calculator:$(IMAGE_TAG)
AIO_NAME ?= $(COMPOSE_PROJECT_NAME)-aio
FUZZTIME ?= 30s
export COMPOSE_PROJECT_NAME WEB_PORT VERSION COMMIT IMAGE_TAG

.PHONY: help bootstrap gen lint test coverage coverage-backend coverage-frontend fuzz bench dev-backend dev-frontend up down logs e2e image-aio run-aio smoke-aio docs-api clean

help: ## List available commands
	@awk 'BEGIN { FS = ":.*## " } /^[a-z][a-z0-9-]*:.*## / { printf "%-20s %s\n", $$1, $$2 }' Makefile

bootstrap: ## Install pinned tools, dependencies and the browser
	scripts/bootstrap.sh

gen: ## Generate the API client types
	pnpm -C frontend run gen:api

lint: ## Check backend, frontend, contract and delivery files
	cd backend && ../bin/golangci-lint fmt --diff ./...
	cd backend && go vet ./...
	cd backend && go vet -tags embedui ./...
	cd backend && ../bin/golangci-lint run ./...
	cd backend && ../bin/golangci-lint run --build-tags embedui ./internal/web/
	pnpm -C frontend run typecheck
	pnpm -C frontend run lint
	pnpm -C frontend run format:check
	pnpm -C frontend run lint:api
	bin/hadolint Dockerfile backend/Dockerfile frontend/Dockerfile
	@workflows=(.github/workflows/*.yml.disabled); \
		[[ -f "$${workflows[0]}" ]] || { echo 'no .github/workflows/*.yml.disabled files found' >&2; exit 1; }; \
		bin/actionlint -shellcheck bin/shellcheck "$${workflows[@]}"
	bin/shellcheck -x scripts/*.sh scripts/ci/*.sh

test: ## Run backend and frontend tests
	cd backend && go test -race -shuffle=on -count=1 ./...
	pnpm -C frontend run test

coverage: ## Generate and gate both coverage reports
	$(MAKE) coverage-backend
	$(MAKE) coverage-frontend

coverage-backend: ## Generate and gate backend coverage
	scripts/coverage.sh backend

coverage-frontend: ## Generate and gate frontend coverage
	pnpm -C frontend run test:coverage
	@for report in coverage/frontend/index.html coverage/frontend/lcov.info coverage/frontend/coverage-summary.json; do \
		test -f "$$report" || { echo "missing frontend coverage report: $$report" >&2; exit 1; }; \
	done

fuzz: ## Fuzz parsing and calculation
	cd backend && go test ./internal/calc -run '^$$' -fuzz '^FuzzParse$$' -fuzztime $(FUZZTIME)
	cd backend && go test ./internal/calc -run '^$$' -fuzz '^FuzzCalculate$$' -fuzztime $(FUZZTIME)

bench: ## Record benchmarks and enforce their budgets
	mkdir -p coverage/bench
	cd backend && go test ./internal/calc -run '^$$' -bench . -benchmem -count=3 | tee ../coverage/bench/bench.txt
	scripts/coverage.sh bench coverage/bench/bench.txt

dev-backend: ## Run the API in the foreground
	cd backend && go run ./cmd/calculator

dev-frontend: ## Run the Vite development server in the foreground
	pnpm -C frontend dev

up: ## Build and start the split stack, waiting for health
	docker compose up --build --wait --wait-timeout 120

down: ## Remove the split stack and orphan containers
	docker compose down --remove-orphans

logs: ## Follow the split stack logs
	docker compose logs --follow --tail 100

e2e: ## Run browser tests against the running split stack
	curl -fsS --max-time 5 $(E2E_BASE_URL)/nginx-health >/dev/null || { echo 'the composed stack is not running at $(E2E_BASE_URL): run make up first' >&2; exit 1; }
	E2E_BASE_URL=$(E2E_BASE_URL) pnpm -C frontend exec playwright test $(E2E_ARGS)

image-aio: ## Build the all-in-one image
	docker build -t $(AIO_IMAGE) --build-arg VERSION=$(VERSION) --build-arg COMMIT=$(COMMIT) .

# The split stack uses the same WEB_PORT: stop it or select a different port first.
run-aio: ## Run the hardened all-in-one container in the foreground
	docker run --rm --name $(AIO_NAME) --read-only --cap-drop ALL --security-opt no-new-privileges -p $(WEB_PORT):8080 $(AIO_IMAGE)

smoke-aio: ## Smoke-test the hardened all-in-one container
	scripts/smoke-aio.sh $(AIO_IMAGE) $(WEB_PORT) $(AIO_NAME)-smoke

docs-api: ## Generate the ignored API reference
	pnpm -C frontend run docs:api
	git check-ignore -q docs/api/index.html

clean: ## Remove generated builds and reports
	rm -rf coverage frontend/dist frontend/test-results frontend/playwright-report frontend/blob-report docs/api/index.html
	find backend/internal/web/dist -mindepth 1 ! -name .gitkeep -delete
	@echo 'Removed coverage, frontend/dist, frontend/test-results, frontend/playwright-report, frontend/blob-report, docs/api/index.html and embedded app files except .gitkeep'
