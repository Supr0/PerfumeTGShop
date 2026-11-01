# syntax=docker/dockerfile:1
# Production API image. Build from the REPOSITORY ROOT:
#   docker build -f apps/api/Dockerfile -t perfume-api .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Runtime dependencies only (no pytest/httpx/aiosqlite in production).
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application code, migrations and the seed package.
COPY alembic.ini ./
COPY alembic ./alembic
COPY apps ./apps
COPY packages ./packages

# Non-root runtime user (fixed uid/gid so host mounts stay predictable).
RUN groupadd --gid 10001 app \
 && useradd --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app \
 && chown -R app:app /app
USER 10001:10001

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3).status == 200 else 1)"

# Shell form so ${WEB_CONCURRENCY:-2} is expanded at container start.
CMD ["sh", "-c", "uvicorn apps.api.main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY:-2}"]
