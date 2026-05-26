#include "proto/header.h"

#include <cstring>

namespace streammix::proto {

bool IsKnownType(std::uint8_t t) {
  switch (static_cast<MessageType>(t)) {
    case MessageType::Hello:
    case MessageType::TrackList:
    case MessageType::AudioOpus:
    case MessageType::Fingerprint:
    case MessageType::TrackMeta:
    case MessageType::Stats:
    case MessageType::SubTracks:
    case MessageType::Error:
      return true;
  }
  return false;
}

namespace {

void WriteU16BE(std::uint8_t* dst, std::uint16_t v) {
  dst[0] = static_cast<std::uint8_t>((v >> 8) & 0xff);
  dst[1] = static_cast<std::uint8_t>(v & 0xff);
}

void WriteU32BE(std::uint8_t* dst, std::uint32_t v) {
  dst[0] = static_cast<std::uint8_t>((v >> 24) & 0xff);
  dst[1] = static_cast<std::uint8_t>((v >> 16) & 0xff);
  dst[2] = static_cast<std::uint8_t>((v >> 8) & 0xff);
  dst[3] = static_cast<std::uint8_t>(v & 0xff);
}

void WriteU64BE(std::uint8_t* dst, std::uint64_t v) {
  for (int i = 7; i >= 0; --i) {
    dst[7 - i] = static_cast<std::uint8_t>((v >> (i * 8)) & 0xff);
  }
}

std::uint16_t ReadU16BE(const std::uint8_t* src) {
  return static_cast<std::uint16_t>((src[0] << 8) | src[1]);
}

std::uint32_t ReadU32BE(const std::uint8_t* src) {
  return (static_cast<std::uint32_t>(src[0]) << 24) |
         (static_cast<std::uint32_t>(src[1]) << 16) |
         (static_cast<std::uint32_t>(src[2]) << 8) |
         static_cast<std::uint32_t>(src[3]);
}

std::uint64_t ReadU64BE(const std::uint8_t* src) {
  std::uint64_t v = 0;
  for (int i = 0; i < 8; ++i) {
    v = (v << 8) | static_cast<std::uint64_t>(src[i]);
  }
  return v;
}

}  // namespace

std::variant<std::vector<std::uint8_t>, ProtocolError> EncodeFrame(const Frame& f) {
  if (f.payload.size() > kMaxPayloadBytes) {
    return ProtocolError{ProtocolErrorKind::TooLarge, "payload too large"};
  }
  if (f.track > kMaxTrackSlot) {
    return ProtocolError{ProtocolErrorKind::BadTrack, "invalid track slot"};
  }
  if (!IsKnownType(static_cast<std::uint8_t>(f.type))) {
    return ProtocolError{ProtocolErrorKind::BadType, "unknown message type"};
  }

  std::vector<std::uint8_t> out(kHeaderBytes + f.payload.size());
  std::memcpy(out.data(), kMagic.data(), kMagic.size());
  out[4] = static_cast<std::uint8_t>(f.type);
  out[5] = f.track;
  out[6] = f.flags;
  WriteU16BE(out.data() + 7, static_cast<std::uint16_t>(f.payload.size()));
  WriteU32BE(out.data() + 9, f.seq);
  WriteU64BE(out.data() + 13, f.timestamp_ms);
  if (!f.payload.empty()) {
    std::memcpy(out.data() + kHeaderBytes, f.payload.data(), f.payload.size());
  }
  return out;
}

std::variant<Frame, ProtocolError> DecodeFrame(std::span<const std::uint8_t> input) {
  if (input.size() < kHeaderBytes) {
    return ProtocolError{ProtocolErrorKind::BadLength, "frame shorter than header"};
  }
  for (std::size_t i = 0; i < kMagic.size(); ++i) {
    if (input[i] != kMagic[i]) {
      return ProtocolError{ProtocolErrorKind::BadMagic, "magic mismatch"};
    }
  }

  std::uint8_t type = input[4];
  std::uint8_t track = input[5];
  std::uint8_t flags = input[6];
  std::uint16_t payload_len = ReadU16BE(input.data() + 7);
  std::uint32_t seq = ReadU32BE(input.data() + 9);
  std::uint64_t ts = ReadU64BE(input.data() + 13);

  if (payload_len > kMaxPayloadBytes) {
    return ProtocolError{ProtocolErrorKind::TooLarge, "payload too large"};
  }
  if (kHeaderBytes + payload_len != input.size()) {
    return ProtocolError{ProtocolErrorKind::BadLength, "length mismatch"};
  }
  if (track > kMaxTrackSlot) {
    return ProtocolError{ProtocolErrorKind::BadTrack, "invalid track slot"};
  }
  if (!IsKnownType(type)) {
    return ProtocolError{ProtocolErrorKind::BadType, "unknown message type"};
  }

  Frame f;
  f.type = static_cast<MessageType>(type);
  f.track = track;
  f.flags = flags;
  f.seq = seq;
  f.timestamp_ms = ts;
  f.payload.assign(input.begin() + kHeaderBytes, input.begin() + kHeaderBytes + payload_len);
  return f;
}

}  // namespace streammix::proto
