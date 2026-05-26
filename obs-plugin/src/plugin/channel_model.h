#pragma once

#include <QAbstractListModel>
#include <QString>
#include <vector>

namespace streammix::plugin {

struct Channel {
    int track_id;           // 1..8
    QString category;       // preset slug or "custom"
    QString label;          // free-text shown to viewers
    QString source_name;    // OBS audio source name to capture
    QString status;         // "ok" | "silent" | "error"
};

// Qt model backing the dock's channel list. Methods are intentionally minimal;
// add/remove enforces the 8-track hard cap.
class ChannelModel : public QAbstractListModel {
    Q_OBJECT
public:
    explicit ChannelModel(QObject* parent = nullptr);

    int rowCount(const QModelIndex& parent = QModelIndex()) const override;
    QVariant data(const QModelIndex& index, int role = Qt::DisplayRole) const override;

    // Returns false if cap reached.
    bool AddChannel(const Channel& ch);
    void RemoveChannel(int row);
    const std::vector<Channel>& Channels() const { return channels_; }

    static constexpr std::size_t kMaxChannels = 8;

private:
    std::vector<Channel> channels_;
};

}  // namespace streammix::plugin
