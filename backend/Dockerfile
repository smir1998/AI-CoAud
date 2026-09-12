# ── AI CoAudS webhook service ────────────────────────────
# Python 3.12: crewai 1.15.18 declares requires-python >=3.10,<3.14
# (verified in its pyproject) — 3.12 is the max-wheel-coverage default;
# 3.13 is supported too. Bump deliberately: scripts/check-deps.sh first.
#
# Mirrored / air-gapped pip index? pass it at build time:
#   docker build --build-arg PIP_INDEX_URL=https://pypi.org/simple ...
FROM python:3.12-slim AS base
ARG PIP_INDEX_URL

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH

# git needed by pip-audit/vcs checks; kept minimal otherwise
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create and activate virtual environment
RUN python -m venv /opt/venv

# Upgrade pip, setuptools, and wheel in the venv for best dependency resolution
RUN pip install --upgrade pip setuptools wheel

COPY requirements.txt .

# Install dependencies in the venv with verbose output for debugging
RUN pip install -r requirements.txt

COPY . .

# non-root — the service only needs /tmp and its own dir
RUN useradd --create-home coauds && chown -R coauds /app
USER coauds

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health', timeout=4).status==200 else 1)"

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
