#pragma once

namespace streammix::plugin {

// Registers the StreamMix dock with OBS (View → Docks → StreamMix).
// Idempotent across module reloads.
void RegisterDock();

// Unregisters the dock and frees per-plugin state. Called on module unload.
void UnregisterDock();

}  // namespace streammix::plugin
