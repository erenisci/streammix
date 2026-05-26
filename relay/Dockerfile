# syntax=docker/dockerfile:1
FROM golang:1.22-alpine AS build
WORKDIR /src

# shared/go is replaced via a relative path in go.mod; copy both modules.
COPY shared/go /src/shared/go
COPY relay /src/relay

WORKDIR /src/relay
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/relay ./cmd/relay

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/relay /usr/local/bin/relay
USER nonroot:nonroot
EXPOSE 8080 9090
ENTRYPOINT ["/usr/local/bin/relay"]
CMD ["--config", "/etc/streammix/config.yaml"]
