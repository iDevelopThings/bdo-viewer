const STORAGE_KEY = "layout-mode";

export type LayoutMode = "v1" | "v2";

export function getLayoutMode(): LayoutMode {
	return localStorage.getItem(STORAGE_KEY) === "v2" ? "v2" : "v1";
}

export function setLayoutMode(mode: LayoutMode) {
	if (getLayoutMode() === mode) {
		return;
	}
	localStorage.setItem(STORAGE_KEY, mode);
	// v1/v2 persist their dockview trees under different keys; a reload gives the target
	// shell a clean mount rather than reconciling one layout tree into the other.
	window.location.reload();
}

export function toggleLayoutMode() {
	setLayoutMode(getLayoutMode() === "v1" ? "v2" : "v1");
}

// Escape hatch: flip layouts from the console or a keybind without a visible control,
// so the experimental shell is never a trap.
if (typeof window !== "undefined") {
	(window as unknown as { __layout: unknown }).__layout = {
		get mode() {
			return getLayoutMode();
		},
		use    : setLayoutMode,
		toggle : toggleLayoutMode,
	};

	window.addEventListener("keydown", (e) => {
		if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === "l") {
			e.preventDefault();
			toggleLayoutMode();
		}
	});
}
