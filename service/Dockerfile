# Built from the repository root, since the service installs the engine from
# source:  docker build -f service/Dockerfile .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Run as an unprivileged user; the service writes nothing to disk.
RUN useradd --create-home --uid 1000 app
WORKDIR /app

COPY engine/pyproject.toml engine/pyproject.toml
COPY engine/autoopt engine/autoopt
COPY service/pyproject.toml service/pyproject.toml
COPY service/autoopt_service service/autoopt_service
RUN pip install ./engine ./service

USER app
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn autoopt_service.app:app --host 0.0.0.0 --port ${PORT} --proxy-headers"]
