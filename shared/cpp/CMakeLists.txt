cmake_minimum_required(VERSION 3.28...3.30)
project(streammix_proto VERSION 0.0.1 LANGUAGES CXX)

# Shared C++ wire-format codec. Consumed by both obs-plugin/ and publisher/.
# Header-and-source pair, C++20. Host-side tests build by default.

if(NOT DEFINED CMAKE_CXX_STANDARD)
  set(CMAKE_CXX_STANDARD 20)
  set(CMAKE_CXX_STANDARD_REQUIRED ON)
  set(CMAKE_CXX_EXTENSIONS OFF)
endif()

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

option(STREAMMIX_PROTO_BUILD_TESTS "Build host-side proto tests" ON)
if(STREAMMIX_PROTO_BUILD_TESTS AND PROJECT_IS_TOP_LEVEL)
  enable_testing()
  add_executable(streammix_proto_tests test/proto_tests.cpp)
  target_link_libraries(streammix_proto_tests PRIVATE streammix_proto)
  add_test(NAME proto_tests COMMAND streammix_proto_tests)
endif()
