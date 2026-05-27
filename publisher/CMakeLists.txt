cmake_minimum_required(VERSION 3.28...3.30)
project(streammix_publisher VERSION 0.0.1 LANGUAGES CXX)

# StreamMix standalone publisher.
#
# A small Windows CLI that captures per-process audio via WASAPI loopback,
# encodes each track with Opus, and publishes to the relay using the
# streammix.v1 wire protocol.
#
# Build (PowerShell):
#   cmake -S . -B build `
#     -DCMAKE_TOOLCHAIN_FILE=C:/vcpkg/scripts/buildsystems/vcpkg.cmake
#   cmake --build build --config Release

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT WIN32)
  message(FATAL_ERROR "streammix_publisher is currently Windows-only (WASAPI). macOS/Linux ports tracked in ROADMAP.")
endif()

# Shared C++ codec (header.cpp / categories.cpp + tests).
add_subdirectory(${CMAKE_SOURCE_DIR}/../shared/cpp shared_cpp)

# vcpkg-installed dependencies.
find_package(Opus CONFIG REQUIRED)
find_package(libwebsockets CONFIG REQUIRED)

add_executable(streammix_publisher
  src/main.cpp
  src/cli.cpp
  src/cli.h
  src/capture.cpp
  src/capture.h
  src/encoder.cpp
  src/encoder.h
  src/ws_client.cpp
  src/ws_client.h
  src/track.h
)

target_include_directories(streammix_publisher PRIVATE src)

target_link_libraries(streammix_publisher PRIVATE
  streammix_proto
  Opus::opus
  websockets_shared
  # Windows audio + COM.
  ole32
  oleaut32
  uuid
  mmdevapi
  ksuser
  mfplat
  mfuuid
)

if(MSVC)
  target_compile_options(streammix_publisher PRIVATE /W4 /permissive- /utf-8)
  target_compile_definitions(streammix_publisher PRIVATE
    NOMINMAX
    WIN32_LEAN_AND_MEAN
    _CRT_SECURE_NO_WARNINGS
    _WIN32_WINNT=0x0A00  # Windows 10 minimum
  )
endif()
