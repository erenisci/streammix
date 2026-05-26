// Minimal hand-rolled test harness — no GoogleTest dependency so this builds
// out of the box. Each REQUIRE failure prints to stderr and bumps a counter;
// non-zero exit code on any failure.

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <variant>

#include "proto/categories.h"
#include "proto/header.h"

using namespace streammix::proto;

static int g_failures = 0;

#define REQUIRE(cond)                                                       \
  do {                                                                      \
    if (!(cond)) {                                                          \
      std::fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);  \
      ++g_failures;                                                         \
    }                                                                       \
  } while (0)

static void TestHeaderConstants() {
  REQUIRE(kHeaderBytes == 21);
  REQUIRE(kMagic[0] == 0x53 && kMagic[1] == 0x4d && kMagic[2] == 0x58 && kMagic[3] == 0x31);
}

static void TestRoundTripEmptyAudio() {
  Frame f;
  f.type = MessageType::AudioOpus;
  f.track = 1;
  f.seq = 42;
  f.timestamp_ms = 1234567890;

  auto encoded = EncodeFrame(f);
  REQUIRE(std::holds_alternative<std::vector<std::uint8_t>>(encoded));
  auto bytes = std::get<std::vector<std::uint8_t>>(encoded);
  REQUIRE(bytes.size() == kHeaderBytes);

  auto decoded = DecodeFrame(bytes);
  REQUIRE(std::holds_alternative<Frame>(decoded));
  auto g = std::get<Frame>(decoded);
  REQUIRE(g.type == f.type);
  REQUIRE(g.track == f.track);
  REQUIRE(g.seq == f.seq);
  REQUIRE(g.timestamp_ms == f.timestamp_ms);
  REQUIRE(g.payload.empty());
}

static void TestRoundTripWithPayload() {
  Frame f;
  f.type = MessageType::Hello;
  f.payload = {1, 2, 3, 4, 5};
  auto bytes = std::get<std::vector<std::uint8_t>>(EncodeFrame(f));
  auto g = std::get<Frame>(DecodeFrame(bytes));
  REQUIRE(g.payload.size() == 5);
  REQUIRE(g.payload[0] == 1 && g.payload[4] == 5);
}

static void TestFieldOffsets() {
  Frame f;
  f.type = MessageType::Hello;
  f.seq = 0x01020304;
  f.timestamp_ms = 0x1122334455667788ULL;
  f.payload = {0xaa};
  auto bytes = std::get<std::vector<std::uint8_t>>(EncodeFrame(f));
  REQUIRE(bytes[0] == 0x53 && bytes[1] == 0x4d && bytes[2] == 0x58 && bytes[3] == 0x31);
  REQUIRE(bytes[4] == static_cast<std::uint8_t>(MessageType::Hello));
  REQUIRE(bytes[5] == 0 && bytes[6] == 0);
  REQUIRE(bytes[7] == 0 && bytes[8] == 1);                     // PAYLOAD_LEN
  REQUIRE(bytes[9] == 0x01 && bytes[12] == 0x04);              // SEQ
  REQUIRE(bytes[13] == 0x11 && bytes[20] == 0x88);             // TS
  REQUIRE(bytes[21] == 0xaa);                                  // payload
}

static void TestRejectShortFrame() {
  std::vector<std::uint8_t> tiny(10);
  auto r = DecodeFrame(tiny);
  REQUIRE(std::holds_alternative<ProtocolError>(r));
  REQUIRE(std::get<ProtocolError>(r).kind == ProtocolErrorKind::BadLength);
}

static void TestRejectBadMagic() {
  std::vector<std::uint8_t> buf(kHeaderBytes);
  auto r = DecodeFrame(buf);
  REQUIRE(std::holds_alternative<ProtocolError>(r));
  REQUIRE(std::get<ProtocolError>(r).kind == ProtocolErrorKind::BadMagic);
}

static void TestRejectLengthMismatch() {
  Frame f;
  f.type = MessageType::AudioOpus;
  f.track = 1;
  f.payload = {1, 2, 3};
  auto bytes = std::get<std::vector<std::uint8_t>>(EncodeFrame(f));
  bytes.pop_back();
  auto r = DecodeFrame(bytes);
  REQUIRE(std::holds_alternative<ProtocolError>(r));
  REQUIRE(std::get<ProtocolError>(r).kind == ProtocolErrorKind::BadLength);
}

static void TestRejectHugePayloadClaim() {
  std::vector<std::uint8_t> buf(kHeaderBytes);
  buf[0] = 0x53; buf[1] = 0x4d; buf[2] = 0x58; buf[3] = 0x31;
  buf[4] = static_cast<std::uint8_t>(MessageType::AudioOpus);
  buf[5] = 1;
  std::uint16_t big = kMaxPayloadBytes + 1;
  buf[7] = static_cast<std::uint8_t>(big >> 8);
  buf[8] = static_cast<std::uint8_t>(big & 0xff);
  auto r = DecodeFrame(buf);
  REQUIRE(std::holds_alternative<ProtocolError>(r));
  REQUIRE(std::get<ProtocolError>(r).kind == ProtocolErrorKind::TooLarge);
}

static void TestRejectBadTrackEncode() {
  Frame f;
  f.type = MessageType::AudioOpus;
  f.track = kMaxTrackSlot + 1;
  auto r = EncodeFrame(f);
  REQUIRE(std::holds_alternative<ProtocolError>(r));
  REQUIRE(std::get<ProtocolError>(r).kind == ProtocolErrorKind::BadTrack);
}

static void TestRejectUnknownType() {
  std::vector<std::uint8_t> buf(kHeaderBytes);
  buf[0] = 0x53; buf[1] = 0x4d; buf[2] = 0x58; buf[3] = 0x31;
  buf[4] = 0x77;
  auto r = DecodeFrame(buf);
  REQUIRE(std::holds_alternative<ProtocolError>(r));
  REQUIRE(std::get<ProtocolError>(r).kind == ProtocolErrorKind::BadType);
}

static void TestPayloadCopyDoesNotAliasInput() {
  Frame f;
  f.type = MessageType::AudioOpus;
  f.track = 1;
  f.payload = {1, 2, 3, 4};
  auto bytes = std::get<std::vector<std::uint8_t>>(EncodeFrame(f));
  auto g = std::get<Frame>(DecodeFrame(bytes));
  // Mutate the input; decoded payload must not change.
  std::memset(bytes.data(), 0, bytes.size());
  REQUIRE(g.payload.size() == 4);
  REQUIRE(g.payload[0] == 1 && g.payload[3] == 4);
}

static void TestCategories() {
  REQUIRE(IsPresetCategory("mic"));
  REQUIRE(IsPresetCategory("music"));
  REQUIRE(!IsPresetCategory("MIC"));
  REQUIRE(!IsPresetCategory("custom"));

  REQUIRE(IsValidSlug("mic"));
  REQUIRE(IsValidSlug("co-host-mic"));
  REQUIRE(!IsValidSlug(""));
  REQUIRE(!IsValidSlug("MIC"));
  REQUIRE(!IsValidSlug("-leading"));
  REQUIRE(!IsValidSlug("trailing-"));
  REQUIRE(!IsValidSlug("double--dash"));
  REQUIRE(!IsValidSlug(std::string(65, 'a')));
}

int main() {
  TestHeaderConstants();
  TestRoundTripEmptyAudio();
  TestRoundTripWithPayload();
  TestFieldOffsets();
  TestRejectShortFrame();
  TestRejectBadMagic();
  TestRejectLengthMismatch();
  TestRejectHugePayloadClaim();
  TestRejectBadTrackEncode();
  TestRejectUnknownType();
  TestPayloadCopyDoesNotAliasInput();
  TestCategories();

  if (g_failures) {
    std::fprintf(stderr, "%d failure(s)\n", g_failures);
    return 1;
  }
  std::fprintf(stdout, "all tests passed\n");
  return 0;
}
