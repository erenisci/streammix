// OBS Studio plugin entry point.
//
// Phase 4 scope: register the module, create the dock, hold the channel list
// model. Actual audio capture (libobs audio callbacks), Opus encode, and the
// WebSocket publisher are TODOs marked inline — they need libopus and a WS
// client library which are configured in CMake but require the OBS dev kit
// for full integration. The host-side unit tests cover the wire codec.
//
// This file only compiles when STREAMMIX_BUILD_PLUGIN is set in CMake; on the
// default scaffold build it is excluded so contributors without the OBS dev
// kit can still build and run the proto tests.

#include <obs-module.h>

#include "plugin/dock.h"

OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE("streammix", "en-US")

bool obs_module_load(void) {
    streammix::plugin::RegisterDock();
    return true;
}

void obs_module_unload(void) {
    streammix::plugin::UnregisterDock();
}

const char* obs_module_name(void) {
    return "StreamMix";
}

const char* obs_module_description(void) {
    return "Publish per-source audio (mic, game, music, ...) as named "
           "side-channels for viewers running the StreamMix extension.";
}
