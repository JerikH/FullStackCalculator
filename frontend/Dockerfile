# Web image (calculator-web): the built app behind the nginx edge.
# Build from the repository root: docker build -f frontend/Dockerfile -t calculator-web:local .

# Build stage: Node and pnpm as pinned for the project (package.json packageManager).
FROM --platform=$BUILDPLATFORM node:24.14.1-alpine3.23@sha256:8510330d3eb72c804231a834b1a8ebb55cb3796c3e4431297a24d246b8add4d5 AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true
WORKDIR /src/frontend
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN --mount=type=cache,id=calculator-pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /pnpm-store
COPY frontend/ ./
# The edge serves exactly this layout: index.html, the external theme bootstrap
# and content-hashed assets with their source maps.
RUN pnpm run build \
    && test -f dist/index.html \
    && test -f dist/theme-init.js \
    && ls dist/assets/*.js dist/assets/*.js.map > /dev/null

# Runtime: nginx as uid 101, read-only root compatible. Writable at run time:
# /tmp (pid, temporary files) and /etc/nginx/conf.d
# (the configuration rendered from the template at start).
FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03
ENV API_UPSTREAM=api:8081 \
    NGINX_ENVSUBST_FILTER=^API_UPSTREAM$
# A tmpfs mounted on /etc/nginx/conf.d takes this directory's mode but belongs
# to root, so the mode must let uid 101 write the rendered configuration. The
# base image's default server and pages are removed: only the template defines
# servers and only the built app is served.
USER 0
RUN rm -f /etc/nginx/conf.d/default.conf \
    && rm -rf /usr/share/nginx/html \
    && chmod 1777 /etc/nginx/conf.d
USER 101
COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/nginx/security-headers.conf deploy/nginx/proxy-api.conf /etc/nginx/snippets/
COPY --from=build /src/frontend/dist/ /usr/share/nginx/calculator/
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD ["wget", "-q", "--spider", "-T", "2", "http://127.0.0.1:8080/nginx-health"]
