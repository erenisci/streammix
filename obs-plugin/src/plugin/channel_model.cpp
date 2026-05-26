#include "plugin/channel_model.h"

namespace streammix::plugin {

ChannelModel::ChannelModel(QObject* parent) : QAbstractListModel(parent) {}

int ChannelModel::rowCount(const QModelIndex& parent) const {
    if (parent.isValid()) return 0;
    return static_cast<int>(channels_.size());
}

QVariant ChannelModel::data(const QModelIndex& index, int role) const {
    if (!index.isValid()) return {};
    if (index.row() < 0 || static_cast<std::size_t>(index.row()) >= channels_.size()) return {};
    const auto& c = channels_[index.row()];

    if (role == Qt::DisplayRole) {
        return QString("%1 — %2 (%3)").arg(c.label, c.category, c.status);
    }
    return {};
}

bool ChannelModel::AddChannel(const Channel& ch) {
    if (channels_.size() >= kMaxChannels) return false;
    const int row = static_cast<int>(channels_.size());
    beginInsertRows(QModelIndex(), row, row);
    channels_.push_back(ch);
    endInsertRows();
    return true;
}

void ChannelModel::RemoveChannel(int row) {
    if (row < 0 || static_cast<std::size_t>(row) >= channels_.size()) return;
    beginRemoveRows(QModelIndex(), row, row);
    channels_.erase(channels_.begin() + row);
    endRemoveRows();
}

}  // namespace streammix::plugin
