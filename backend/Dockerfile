# API image (calculator-api): the Go service without the web app.
# Build from the repository root: docker build -f backend/Dockerfile -t calculator-api:local .
# Build arguments VERSION and COMMIT are written into the build info served by /healthz.

# Build stage. GOTOOLCHAIN=local: the image's Go is the one go.mod names, never a
# toolchain downloaded at build time.
FROM --platform=$BUILDPLATFORM golang:1.27.3-alpine3.24@sha256:d200d2dd76b03a99b52651fd1325aff7dcd35422c35c01bac56571b0507f3deb AS build
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
# The build info is declared last so a new version or commit reuses the layers above.
ARG VERSION=dev
ARG COMMIT=unknown
RUN --mount=type=cache,id=calculator-go-mod,target=/go/pkg/mod \
    --mount=type=cache,id=calculator-go-build,target=/root/.cache/go-build \
    GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath \
      -ldflags="-s -w \
        -X 'github.com/JerikH/FullStackCalculator/backend/internal/buildinfo.Version=${VERSION}' \
        -X 'github.com/JerikH/FullStackCalculator/backend/internal/buildinfo.Commit=${COMMIT}'" \
      -o /out/calculator ./cmd/calculator

# Runtime: static binary on distroless as uid 65532, nothing writable needed.
# The service defaults (:8081 API, :9091 admin) are this image's contract; the
# admin port is never published.
FROM gcr.io/distroless/static-debian13:nonroot@sha256:d62067879de890a1def9da0e7766b7d20810a5e5555cef8506b752437d7a3e88
ARG VERSION=dev
ARG COMMIT=unknown
LABEL org.opencontainers.image.title="calculator-api" \
      org.opencontainers.image.description="Arbitrary-precision calculator REST API" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${COMMIT}"
COPY --from=build /out/calculator /calculator
USER 65532:65532
# 9091 (admin) is listened on but deliberately not exposed: docker run -P must never publish it.
EXPOSE 8081
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/calculator", "healthcheck"]
ENTRYPOINT ["/calculator"]
