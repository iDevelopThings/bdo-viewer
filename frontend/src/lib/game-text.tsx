// BDO text carries colour markup in two formats:
//   <PAColor0xAARRGGBB> … <PAOldColor>          (legacy / game-file format)
//   <span style="color: #RRGGBB"> … </span>     (questlog format)
// Both push/pop a colour on a stack. Everything else in angle brackets (e.g.
// <How to Use>, <Heidel>, NPC names) is literal text and is preserved.

import {useMemo} from "react";
import {parseARGB} from "@/utils.tsx";

export type TextSegment = { text: string; color?: string };

const TOKEN_RE      = /<PAColor0x([0-9a-fA-F]{6,8})>|<PAOldColor>|<span\b([^>]*)>|<\/span>/g;
const STRIP_RE      = /<PAColor0x[0-9a-fA-F]{6,8}>|<PAOldColor>|<span\b[^>]*>|<\/span>/g;
const SPAN_COLOR_RE = /color:\s*(#[0-9a-fA-F]{3,8})/i;

// Retuned from the game's raw (near-neon) codes to sit in our palette: chroma pulled
// back and lightness evened out so they read on the dark surfaces without searing —
// red especially is lifted, since full-saturation red is too dark on a dark background.
const PA_COLORS = {
	// (gold)
	'ffe9bd23' : "oklch(0.82 0.115 92)",
	// (yellow)
	'fff3d900' : "oklch(0.88 0.145 103)",
	// (red)
	'fff32200' : "oklch(0.68 0.19 27)",
	// (violet)
	'ffb793ff' : "oklch(0.76 0.13 300)",
	// (pale yellow)
	'ffffc62b' : "oklch(0.83 0.135 80)",
	// (green)
	'ff57f426' : "oklch(0.8 0.17 145)",
};


// Parse game text into coloured segments. Colours nest via a stack, so
// PAOldColor reverts to whatever colour was active before the last PAColor.
// eslint-disable-next-line react-refresh/only-export-components
export function parseGameText(input: string): TextSegment[] {
	if (!input) return [];
	const segments: TextSegment[]       = [];
	const stack: (string | undefined)[] = [];
	let last                            = 0;
	let m: RegExpExecArray | null;

	const push = (text: string) => {
		if (text) segments.push({text, color : stack[stack.length - 1]});
	};

	TOKEN_RE.lastIndex = 0;
	while ((m = TOKEN_RE.exec(input)) !== null) {
		push(input.slice(last, m.index));
		if (m[1] !== undefined) {
			// <PAColor0x…>
			stack.push(PA_COLORS[m[1]]);
		} else if (m[0].startsWith("<span")) {
			// <span style="color:#…"> — inherit current colour if none specified.
			const cm = m[2] ? m[2].match(SPAN_COLOR_RE) : null;
			stack.push(cm ? cm[1] : stack[stack.length - 1]);
		} else {
			// <PAOldColor> or </span> — revert.
			stack.pop();
		}
		last = TOKEN_RE.lastIndex;
	}
	push(input.slice(last));
	return segments;
}

// Plain-text version (colour tags removed) for places that need a string,
// e.g. title/aria attributes.
// eslint-disable-next-line react-refresh/only-export-components
export function plainGameText(input: string): string {
	return (input ?? "").replace(STRIP_RE, "");
}

export function GameText({text, className, textClassName}: { text: string, className?: string, textClassName?: string }) {
	const segments = useMemo(() => parseGameText(text), [text]);

	if (!text) {
		return null;
	}

	return (
		<span className={className} style={{whiteSpace : "pre-line"}}>
			{segments.map((s, i) =>
				s.color ? (
					<span key={i} style={{color : s.color}} className={textClassName}>{s.text}</span>
				) : (
					<span key={i} className={textClassName}>{s.text}</span>
				),
			)}
		</span>
	);

}
