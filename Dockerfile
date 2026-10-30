# All-in-one image: the Go service with the built web app embedded.
# Build from the repository root: docker build -t calculator:local .

FROM --platform=$BUILDPLATFORM node:24.22.1-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS web-build
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

FROM --platform=$BUILDPLATFORM golang:1.27.3-alpine3.24@sha256:b8c9b82affbbb82a020bbcf998dad2ba9516944ac7e883524642a481a9505e9c AS go-build
ARG TARGETOS
ARG TARGETARCH
ENV GOTOOLCHAIN=local \
    CGO_ENABLED=0
WORKDIR /src
# Modules in their own layer: re-downloaded only when go.mod or go.sum change.
COPY backend/go.mod backend/go.sum ./
RUN --mount=type=cache,id=calculator-go-mod,target=/go/pkg/mod \
    go mod download
COPY backend/ ./
COPY --from=web-build /src/frontend/dist/ ./internal/web/dist/
# Fail before compilation if the embedded app is incomplete. Preserve dist/.gitkeep.
RUN test -f internal/web/dist/index.html && test -f internal/web/dist/theme-init.js
# The build info is declared last so a new version or commit reuses the layers above.
ARG VERSION=dev
ARG COMMIT=unknown
RUN --mount=type=cache,id=calculator-go-mod,target=/go/pkg/mod \
    --mount=type=cache,id=calculator-go-build,target=/root/.cache/go-build \
    GOOS=$TARGETOS GOARCH=$TARGETARCH go build -tags embedui -trimpath \
      -ldflags="-s -w \
        -X 'github.com/JerikH/FullStackCalculator/backend/internal/buildinfo.Version=${VERSION}' \
        -X 'github.com/JerikH/FullStackCalculator/backend/internal/buildinfo.Commit=${COMMIT}'" \
      -o /out/calculator ./cmd/calculator

FROM gcr.io/distroless/static-debian13:nonroot@sha256:18f4cc26c9ffa7f20a359298be7deadac5c607c8e03a02b8119f1a5fc2f82c99 AS runtime
ARG VERSION=dev
ARG COMMIT=unknown
LABEL org.opencontainers.image.title="calculator" \
      org.opencontainers.image.description="Arbitrary-precision calculator with embedded web app" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${COMMIT}"
COPY --from=go-build /out/calculator /calculator
ENV CALC_HTTP_ADDR=:8080
USER 65532:65532
# 9091 (admin) is listened on but deliberately not exposed: docker run -P must never publish it.
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/calculator", "healthcheck"]
ENTRYPOINT ["/calculator"]
