// StreamMix wire-format header codec (C++).
// Mirror of shared/ts/src/header.ts and shared/go/header.go.
// See docs/AUDIO_PROTOCOL.md for the spec.
#pragma once

#include <array>
#include <cstdint>
#include <cstddef>
#include <span>
#include <string>
#include <variant>
#include <vector>

namespace streammix::proto {

inline constexpr std::array<std::uint8_t, 4> kMagic = {0x53, 0x4d, 0x58, 0x31}; // "SMX1"
inline constexpr std::size_t kHeaderBytes = 21;
inline constexpr std::size_t kMaxPayloadBytes = 4096;
inline constexpr std::uint8_t kMaxTrackSlot = 0x08;
inline constexpr std::uint8_t kMaxTracks = 8;
inline constexpr std::uint8_t kControlTrack = 0x00;

enum class MessageType : std::uint8_t {
  Hello = 0x01,
  TrackList = 0x02,
  AudioOpus = 0x03,
  Fingerprint = 0x04,
  TrackMeta = 0x05,
  Stats = 0x10,
  SubTracks = 0x20,
  Error = 0xff,
};

bool IsKnownType(std::uint8_t t);

enum class ProtocolErrorKind {
  BadMagic,
  BadLength,
  BadTrack,
  BadType,
  BadPayload,
  TooLarge,
};

struct ProtocolError {
  ProtocolErrorKind kind;
  std::string message;
};

struct Frame {
  MessageType type;
  std::uint8_t track = 0;
  std::uint8_t flags = 0;
  std::uint32_t seq = 0;
  std::uint64_t timestamp_ms = 0;
  std::vector<std::uint8_t> payload;
};

// EncodeFrame returns the serialised bytes on success, or a ProtocolError.
// The encoder never produces a frame the decoder would reject.
std::variant<std::vector<std::uint8_t>, ProtocolError> EncodeFrame(const Frame& f);

// DecodeFrame returns the decoded Frame on success, or a ProtocolError.
// Every field is bounds-checked before the payload is copied; the returned
// Frame does not alias the input span.
std::variant<Frame, ProtocolError> DecodeFrame(std::span<const std::uint8_t> input);

}  // namespace streammix::proto
