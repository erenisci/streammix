#include "proto/categories.h"

namespace streammix::proto {

bool IsPresetCategory(std::string_view s) {
  for (auto c : kPresetCategories) {
    if (c == s) return true;
  }
  return false;
}

bool IsValidSlug(std::string_view s) {
  if (s.empty() || s.size() > 64) return false;
  if (s.front() == '-' || s.back() == '-') return false;

  bool prev_dash = false;
  for (char c : s) {
    if (c == '-') {
      if (prev_dash) return false;
      prev_dash = true;
      continue;
    }
    prev_dash = false;
    bool ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
    if (!ok) return false;
  }
  return true;
}

}  // namespace streammix::proto
