# Local stand-in for the Instruqt VM (host-images/ai-labs-vercel-memory in devrel-instruqt-labs):
# the attendee-facing parts only — code-server, the Jupyter extension, the Deno kernel and the lab.
# MongoDB runs in a separate Atlas Local container instead of Docker-in-Docker.
#
# Build from the lab root:  docker build -f instruqt/local-preview/Dockerfile -t trailhead-webui .
# Run:                      instruqt/local-preview/run.sh
FROM ubuntu:24.04
ARG TARGETARCH
ENV DEBIAN_FRONTEND=noninteractive DENO_DIR=/root/.cache/deno

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git jq unzip xz-utils python3 python3-venv gnupg \
 && rm -rf /var/lib/apt/lists/*

# Same pins as the VM image's setup.sh.
RUN DENO_ARCH=$([ "$TARGETARCH" = arm64 ] && echo aarch64 || echo x86_64) \
 && curl -fsSL -o /tmp/deno.zip "https://github.com/denoland/deno/releases/download/v2.9.6/deno-${DENO_ARCH}-unknown-linux-gnu.zip" \
 && unzip -o /tmp/deno.zip -d /usr/local/bin && rm /tmp/deno.zip
RUN NODE_ARCH=$([ "$TARGETARCH" = arm64 ] && echo arm64 || echo x64) \
 && curl -fsSL "https://nodejs.org/dist/v22.20.0/node-v22.20.0-linux-${NODE_ARCH}.tar.xz" | tar -xJ -C /usr/local --strip-components=1 \
 && npm install -g --no-audit --no-fund vercel@63.0.1
RUN curl -fsSL https://code-server.dev/install.sh | sh -s -- --version=4.135.0

ENV EXTENSIONS_DIR=/root/.local/share/code-server/extensions
RUN for e in mongodb.mongodb-vscode@1.17.1 ms-python.python@2026.4.0 ms-toolsai.jupyter@2025.9.1; do \
      code-server --install-extension "$e" --extensions-dir "$EXTENSIONS_DIR"; done \
 && git clone --depth 1 https://github.com/mongodb-developer/open-once-extension.git /tmp/ooe \
 && code-server --install-extension /tmp/ooe/open-once-extension-0.0.10.vsix --extensions-dir "$EXTENSIONS_DIR" \
 && rm -rf /tmp/ooe

COPY . /root/labs/vercel-mongodb-ai-memory-lab
RUN cd /root/labs/vercel-mongodb-ai-memory-lab && deno install && deno check scripts/lab.ts
RUN python3 -m venv /root/labs/.venv && /root/labs/.venv/bin/pip install -q jupyter_client && deno jupyter --install

COPY instruqt/local-preview/settings.json /root/.local/share/code-server/User/settings.json
RUN echo 'set -a; [ -f /etc/lab-env ] && . /etc/lab-env; set +a' >> /etc/bash.bashrc

EXPOSE 8080
CMD ["code-server", "--bind-addr", "0.0.0.0:8080", "--auth", "none", \
     "--user-data-dir", "/root/.local/share/code-server", "--extensions-dir", "/root/.local/share/code-server/extensions", \
     "--disable-telemetry", "--disable-update-check", "/root/labs/vercel-mongodb-ai-memory-lab"]
