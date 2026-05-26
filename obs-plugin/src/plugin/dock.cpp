#include "plugin/dock.h"

#include <obs-frontend-api.h>

#include <QDockWidget>
#include <QLabel>
#include <QListView>
#include <QPushButton>
#include <QString>
#include <QVBoxLayout>
#include <QWidget>

#include "plugin/channel_model.h"

namespace streammix::plugin {

namespace {

QDockWidget* g_dock = nullptr;
ChannelModel* g_model = nullptr;

QWidget* BuildPanel() {
    auto* container = new QWidget();
    auto* layout = new QVBoxLayout(container);

    // Connection panel — relay URL / channel id / token / Connect button.
    // TODO(phase4): wire to a settings store and the WebSocket publisher.
    auto* connection = new QLabel("Disconnected — configure relay below");
    layout->addWidget(connection);

    // Channel list.
    g_model = new ChannelModel(container);
    auto* listView = new QListView();
    listView->setModel(g_model);
    layout->addWidget(listView, /*stretch=*/1);

    // Add Channel button.
    auto* addBtn = new QPushButton("Add Channel");
    QObject::connect(addBtn, &QPushButton::clicked, container, []() {
        // TODO(phase4): open a modal with category dropdown + source picker.
        // Enforces kMaxTracks (8) when adding.
    });
    layout->addWidget(addBtn);

    return container;
}

}  // namespace

void RegisterDock() {
    if (g_dock) return;
    auto* panel = BuildPanel();
    g_dock = new QDockWidget("StreamMix");
    g_dock->setObjectName("streammix-dock");
    g_dock->setWidget(panel);

    // OBS frontend API: insert dock into the main window menu.
    obs_frontend_add_dock(g_dock);
}

void UnregisterDock() {
    // OBS handles dock ownership on shutdown; nullify to make this idempotent.
    g_dock = nullptr;
    g_model = nullptr;
}

}  // namespace streammix::plugin
