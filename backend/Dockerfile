FROM python:3.12-slim

WORKDIR /app

# Install uv for fast dependency installs
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install curl (needed by Docker healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (cached layer — only rebuilds on pyproject change)
COPY pyproject.toml .
RUN uv pip install --system --no-cache .

# Copy application source
COPY pipeline/ pipeline/
COPY app/ app/

# Bake the pipeline cache into the image for deploy (Railway/Fly/etc).
# For local dev, a volume mount at /app/data/processed overrides these files.
COPY data/ data/

ENV PYTHONUNBUFFERED=1
ENV GRANT_RADAR_CACHE_DIR=/app/data/processed

EXPOSE 8000

# Default: serve the API (reads from cache volume — starts in <1s)
# Override with: docker compose run --rm pipeline python -m pipeline run
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
