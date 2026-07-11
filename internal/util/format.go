package util

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

// FormatNumber renders a number the way the frontend's Intl-backed numberFormat
// does: grouped thousands, at most 3 significant digits, no more than 2 decimal
// places, and no trailing zeros.
func FormatNumber(value float64) string {
	if value == 0 {
		return "0"
	}

	neg := value < 0
	abs := math.Abs(value)

	decimals := 2 - int(math.Floor(math.Log10(abs))) // digits needed for 3 sig figs
	if decimals > 2 {
		decimals = 2
	}
	if decimals < 0 {
		decimals = 0
	}

	factor := math.Pow(10, float64(decimals))
	rounded := math.Round(abs*factor) / factor

	text := trimTrailingZeros(strconv.FormatFloat(rounded, 'f', decimals, 64))
	text = groupThousands(text)

	if neg {
		return "-" + text
	}
	return text
}

func trimTrailingZeros(s string) string {
	if !strings.Contains(s, ".") {
		return s
	}
	return strings.TrimRight(strings.TrimRight(s, "0"), ".")
}

func groupThousands(s string) string {
	intPart, fracPart, hasFrac := strings.Cut(s, ".")

	var grouped strings.Builder
	for i, digit := range intPart {
		if i > 0 && (len(intPart)-i)%3 == 0 {
			grouped.WriteByte(',')
		}
		grouped.WriteRune(digit)
	}

	out := grouped.String()
	if hasFrac {
		out += "." + fracPart
	}
	return out
}

// FormatMoney renders a value as BDO's compact silver notation, e.g. 1,100,000
// -> "1.1m".
func FormatMoney(value int64) string {
	abs := value
	neg := value < 0
	if neg {
		abs = -abs
	}

	var text string
	switch {
	case abs >= 1_000_000_000_000:
		text = fmt.Sprintf("%.1ft", float64(abs)/1_000_000_000_000)
	case abs >= 1_000_000_000:
		text = fmt.Sprintf("%.1fb", float64(abs)/1_000_000_000)
	case abs >= 1_000_000:
		text = fmt.Sprintf("%.1fm", float64(abs)/1_000_000)
	case abs >= 1_000:
		text = fmt.Sprintf("%.1fk", float64(abs)/1_000)
	default:
		text = strconv.FormatInt(abs, 10)
	}

	if neg {
		return "-" + text
	}
	return text
}

// FormatDuration renders a duration the way the frontend's durationLabel does:
// the coarsest unit that fits, with a secondary unit when it isn't exact.
func FormatDuration(d time.Duration) string {
	s := int64(d / time.Second)

	switch {
	case s >= 86400:
		days := s / 86400
		if days == 1 {
			return "1 day"
		}
		return fmt.Sprintf("%d days", days)
	case s >= 3600:
		h := s / 3600
		m := (s % 3600) / 60
		if m == 0 {
			return fmt.Sprintf("%d h", h)
		}
		return fmt.Sprintf("%dh %dm", h, m)
	case s >= 60:
		m := s / 60
		sec := s % 60
		if sec == 0 {
			return fmt.Sprintf("%d min", m)
		}
		return fmt.Sprintf("%dm %ds", m, sec)
	default:
		return fmt.Sprintf("%ds", s)
	}
}

// HumanizeString turns "SOME_FUNC_NAME" into "Some Func Name".
func HumanizeString(fn string) string {
	words := strings.Fields(strings.ReplaceAll(strings.ToLower(fn), "_", " "))
	for i, w := range words {
		words[i] = strings.ToUpper(w[:1]) + w[1:]
	}
	return strings.Join(words, " ")
}
