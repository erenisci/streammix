# Test Vectors

Canonical byte sequences and their expected decoded forms. Both `shared/ts/` and `shared/go/` consume these in their tests to guarantee that the two implementations produce identical bytes.

Format: `vectors.json` contains an array of cases:

```json
{
  "name": "hello-minimal",
  "type": "HELLO",
  "track": 0,
  "flags": 0,
  "seq": 1,
  "timestamp_ms": 0,
  "header_hex": "534d583101000000010000000100000000000000000000",
  "payload_json": { "version": 1, "client": "test/0", "audio": { ... } },
  "frame_hex": "534d5831...........(full frame with payload)"
}
```

When a test vector changes, update both language tests in the same commit. The vectors are the contract — drift between them means one of the codecs is wrong.
