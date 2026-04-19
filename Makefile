# Grant Radar — Makefile
# Requires: uv, node/npm, docker (optional)
#
# Quick start:
#   make install       install all dependencies
#   make pipeline      process local CSV → data/processed/ (run once before dev/prod)
#   make dev           start backend + frontend in development mode

.PHONY: help install pipeline pipeline-fetch dev backend frontend \
        docker-up docker-down docker-build docker-pipeline \
        lint clean

# ── Detect OS for open-browser command ────────────────────────────────────────
UNAME := $(shell uname)
ifeq ($(UNAME), Darwin)
  OPEN := open
else
  OPEN := xdg-open
endif

BACKEND_DIR  := backend
FRONTEND_DIR := frontend
VENV         := .venv
UV           := uv

help:
	@echo ""
	@echo "  Grant Radar — available targets"
	@echo ""
	@echo "  Setup"
	@echo "    make install           Install all backend + frontend dependencies"
	@echo ""
	@echo "  Pipeline  (run before starting the server)"
	@echo "    make pipeline          Process data/federal_grants_raw.csv → cache"
	@echo "    make pipeline-fetch    Re-download from CKAN then process"
	@echo "    make pipeline-info     Show current cache status"
	@echo ""
	@echo "  Development"
	@echo "    make dev               Start backend + frontend (parallel)"
	@echo "    make backend           Start backend only  (http://localhost:8000)"
	@echo "    make frontend          Start frontend only (http://localhost:3000)"
	@echo ""
	@echo "  Docker"
	@echo "    make docker-build      Build all images"
	@echo "    make docker-pipeline   Run pipeline inside Docker (writes to volume)"
	@echo "    make docker-up         Start full stack (after docker-pipeline)"
	@echo "    make docker-down       Stop containers"
	@echo ""
	@echo "  Maintenance"
	@echo "    make lint              Lint backend (ruff) + frontend (eslint)"
	@echo "    make clean             Remove build artefacts and cache"
	@echo ""

# ── Install ───────────────────────────────────────────────────────────────────

install:
	@echo "Installing backend dependencies..."
	cd $(BACKEND_DIR) && $(UV) pip install -e .
	@echo "Installing frontend dependencies..."
	cd $(FRONTEND_DIR) && npm install
	@echo "Done. Run 'make pipeline' next."

$(FRONTEND_DIR)/node_modules: $(FRONTEND_DIR)/package.json
	@echo "Installing frontend dependencies..."
	cd $(FRONTEND_DIR) && npm install

# ── Pipeline ──────────────────────────────────────────────────────────────────

pipeline:
	@echo "Running pipeline (local CSV → data/processed/)..."
	cd $(BACKEND_DIR) && $(UV) run python -m pipeline run

pipeline-fetch:
	@echo "Running pipeline (CKAN download → data/processed/)..."
	cd $(BACKEND_DIR) && $(UV) run python -m pipeline run --fetch

pipeline-skip-scraper:
	@echo "Running pipeline (no HTML scraper)..."
	cd $(BACKEND_DIR) && $(UV) run python -m pipeline run --skip-programs

pipeline-info:
	cd $(BACKEND_DIR) && $(UV) run python -m pipeline info

# ── Development servers ───────────────────────────────────────────────────────

dev:
	@echo "Starting backend + frontend..."
	@$(MAKE) -j2 backend frontend

backend:
	cd $(BACKEND_DIR) && $(UV) run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

frontend: $(FRONTEND_DIR)/node_modules
	cd $(FRONTEND_DIR) && npm run dev

# ── Docker ────────────────────────────────────────────────────────────────────

docker-build:
	docker compose build

docker-pipeline:
	@echo "Running pipeline inside Docker (writes to named volume)..."
	docker compose run --rm pipeline

docker-up:
	docker compose up -d
	@echo "Backend:  http://localhost:8000/api/health"
	@echo "Frontend: http://localhost:3000"

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

# ── Lint ──────────────────────────────────────────────────────────────────────

lint: $(FRONTEND_DIR)/node_modules
	@echo "Linting backend..."
	cd $(BACKEND_DIR) && $(UV) run ruff check . || true
	@echo "Linting frontend..."
	cd $(FRONTEND_DIR) && npm run lint || true

# ── Clean ─────────────────────────────────────────────────────────────────────

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".next" -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	rm -rf $(BACKEND_DIR)/.ruff_cache
	@echo "Cleaned build artefacts. Pipeline cache (data/processed/) preserved."
