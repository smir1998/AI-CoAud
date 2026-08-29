# ── AI CoAudS webhook service ────────────────────────────
# 3.12 (not 3.13): the pinned scanner set in requirements.txt — crewai 0.98,
# semgrep 1.100 — is validated against this runtime. Bump both together once
# the scanner ecosystem ships 3.13-verified wheels.
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# git needed by pip-audit/vcs checks; kept minimal otherwise
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
# current pip: better resolver, better error messages on conflicts
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# non-root — the service only needs /tmp and its own dir
RUN useradd --create-home coauds && chown -R coauds /app
USER coauds

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health', timeout=4).status==200 else 1)"

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
