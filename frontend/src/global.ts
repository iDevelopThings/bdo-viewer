import type {DockviewApi} from "dockview-react";
import type {DevHelpers} from "@/lib/dev.ts";

declare global {
	interface Window extends DevHelpers {
		dockviewApi?: DockviewApi;
	}
}
