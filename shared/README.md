# shared

Wire-format codec used by every StreamMix component. Two parallel implementations of one specification:

- `ts/` — TypeScript package, consumed by the browser extension
- `go/` — Go module, consumed by the relay server

The canonical spec lives in `docs/AUDIO_PROTOCOL.md`. When the spec changes, both implementations and their tests update in the same commit. Drift between languages is a bug.

## TypeScript

```bash
cd shared/ts
pnpm install                   # or: npm install
npx tsc --noEmit               # typecheck
node --import tsx --test test/*.test.ts   # run tests
```

The package is published as `@streammix/shared` (private). Other workspaces inside the repo import it via the file path or a workspace protocol once a root `pnpm-workspace.yaml` lands.

## Go

```bash
cd shared/go
go test ./...
```

Importable as `github.com/streammix/streammix/shared/go` (the relay declares a `replace` directive to point at the local path).

## Test Vectors

`testvectors/` holds canonical byte sequences and the JSON forms they decode to. Both languages assert against these so any divergence is caught at test time.
