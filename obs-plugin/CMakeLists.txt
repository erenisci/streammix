cmake_minimum_required(VERSION 3.28...3.30)

project(streammix VERSION 0.0.1 LANGUAGES CXX)

# ----------------------------------------------------------------------------
# OBS plugin baseline. We expect either:
#   - libobs dev kit installed and findable via find_package(libobs)
#   - OR OBS_BUILD_DIR set to a local checkout of obsproject/obs-studio
#     (CI typically takes that path)
#
# Real plugin builds need additional setup:
#   * Qt6 (Widgets, Core) for the dock UI
#   * libopus for audio encode
#   * libwebsockets (or another WS client) for the publisher connection
#
# This CMakeLists is the scaffold — once an OBS dev kit is on PATH the
# remaining find_package calls are uncommented and the plugin compiles.
# ----------------------------------------------------------------------------

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(STREAMMIX_BUILD_PLUGIN "Build the libobs plugin (requires libobs dev kit)" OFF)

# Always build the protocol helper static library so the host (or unit tests)
# can use it independently of OBS.
add_library(streammix_proto STATIC
  src/proto/header.cpp
  src/proto/header.h
  src/proto/categories.cpp
  src/proto/categories.h
)

target_include_directories(streammix_proto PUBLIC src)

if(MSVC)
  target_compile_options(streammix_proto PRIVATE /W4 /WX /permissive-)
else()
  target_compile_options(streammix_proto PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif()

# ----------------------------------------------------------------------------
# Plugin target (gated by option until dev kit is present).
# ----------------------------------------------------------------------------
if(STREAMMIX_BUILD_PLUGIN)
  find_package(libobs REQUIRED)
  find_package(Qt6 COMPONENTS Widgets Core REQUIRED)
  set(CMAKE_AUTOMOC ON)

  add_library(streammix MODULE
    src/plugin/plugin_main.cpp
    src/plugin/dock.cpp
    src/plugin/dock.h
    src/plugin/channel_model.cpp
    src/plugin/channel_model.h
  )

  target_link_libraries(streammix PRIVATE
    OBS::libobs
    Qt6::Widgets
    Qt6::Core
    streammix_proto
  )

  set_target_properties(streammix PROPERTIES PREFIX "")
  install(TARGETS streammix DESTINATION obs-plugins/64bit)
endif()

# ----------------------------------------------------------------------------
# Tests (host-side, no OBS needed).
# ----------------------------------------------------------------------------
enable_testing()
add_executable(streammix_proto_tests
  test/proto_tests.cpp
)
target_link_libraries(streammix_proto_tests PRIVATE streammix_proto)
add_test(NAME proto_tests COMMAND streammix_proto_tests)
