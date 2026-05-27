cmake_minimum_required(VERSION 3.28...3.30)

project(streammix VERSION 0.0.1 LANGUAGES CXX)

# ----------------------------------------------------------------------------
# StreamMix OBS plugin. Two build modes:
#
#   STREAMMIX_BUILD_PLUGIN=OFF  (default)
#     Builds just the shared C++ codec for unit testing; no OBS dev kit needed.
#     Use this for CI and contributor onboarding without libobs / Qt.
#
#   STREAMMIX_BUILD_PLUGIN=ON
#     Real libobs module. Requires the OBS dev kit (find_package(libobs)) and
#     Qt6 (find_package(Qt6 ...)).
# ----------------------------------------------------------------------------

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Pull in the shared codec library. Same target is used by publisher/.
add_subdirectory(${CMAKE_SOURCE_DIR}/../shared/cpp shared_cpp)

option(STREAMMIX_BUILD_PLUGIN "Build the libobs plugin (requires OBS dev kit)" OFF)

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
