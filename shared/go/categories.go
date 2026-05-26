package wire

import (
	"regexp"
	"strings"
	"unicode"
)

// CustomCategory is the slug value for channels not in the preset list.
const CustomCategory = "custom"

// PresetCategories mirrors shared/ts/src/categories.ts. Keep in lockstep with
// docs/CHANNEL_CATEGORIES.md. Slugs are lowercase ASCII kebab-case.
var PresetCategories = []string{
	"mic",
	"game",
	"music",
	"voicechat",
	"notifications",
	"browser",
	"alerts",
	"tts",
}

// IsPresetCategory reports whether s is one of the standard preset slugs.
// Comparison is exact; case-insensitive matching is intentionally NOT done.
func IsPresetCategory(s string) bool {
	for _, c := range PresetCategories {
		if c == s {
			return true
		}
	}
	return false
}

var slugRe = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

// IsValidSlug enforces the wire slug rule: 1..64 ASCII characters,
// lowercase kebab-case, no leading/trailing dash, no double dash.
func IsValidSlug(s string) bool {
	if len(s) < 1 || len(s) > 64 {
		return false
	}
	return slugRe.MatchString(s)
}

// Sluggify is a permissive label → slug converter. Used to derive a stable
// identifier from a streamer-supplied free-text channel label.
func Sluggify(label string) string {
	// Lowercase + strip combining marks.
	var b strings.Builder
	for _, r := range strings.ToLower(label) {
		if unicode.Is(unicode.Mn, r) {
			continue
		}
		b.WriteRune(r)
	}
	s := b.String()
	// Collapse non-[a-z0-9] runs into single dashes.
	var out strings.Builder
	prevDash := false
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			out.WriteRune(r)
			prevDash = false
		} else if !prevDash && out.Len() > 0 {
			out.WriteByte('-')
			prevDash = true
		}
	}
	return strings.Trim(out.String(), "-")
}
