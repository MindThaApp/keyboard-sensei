# Sheet-music recognition (OMR) service: homr behind a small HTTP wrapper (server.py).
#
# homr is AGPL-3.0 (https://github.com/liebharc/homr). It is installed unmodified at the
# pinned commit below and runs here as a separate program in its own container; Keyboard
# Sensei talks to it over HTTP only and never links it. The models are downloaded at build
# time, so the running container needs no network at all.
#
# Built and tested on linux/arm64; every dependency also ships linux/amd64 wheels. See docs/operations.md, "Sheet-music recognition".

ARG HOMR_COMMIT=b549203bb030cb031d8b73ae3918f35638713cc2

FROM python:3.12-slim AS build
ARG HOMR_COMMIT
RUN apt-get update \
  && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*
RUN python -m venv /opt/homr \
  && /opt/homr/bin/pip install --no-cache-dir "homr[cpu] @ git+https://github.com/liebharc/homr@${HOMR_COMMIT}" \
  && /opt/homr/bin/homr --init

FROM python:3.12-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --uid 10001 omr
COPY --from=build /opt/homr /opt/homr
ENV PATH=/opt/homr/bin:$PATH \
    HOMR_BIN=/opt/homr/bin/homr \
    PYTHONUNBUFFERED=1 \
    OMP_NUM_THREADS=2
WORKDIR /srv
COPY server.py test_server.py ./
USER omr
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=4)"]
CMD ["python", "server.py"]
