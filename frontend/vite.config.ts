import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import wails from "@wailsio/runtime/plugins/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";


/*
// DO NOT DELETE! THIS IS FOR EASY DEBUGGING

import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
function wailsCallLogger(): Plugin {
	return {
		name    : "wails-call-logger",
		apply   : "serve",        // dev only, never in prod build
		enforce : "pre",
		transform(code, id) {
			if (!id.includes("/bindings/")) return;        // scope to generated bindings
			if (!code.includes("@wailsio/runtime")) return;
			// only the bare specifier — the closing quote right after `runtime`
			// means "@wailsio/runtime/events" etc. are left alone
			return code.replace(/(['"])@wailsio\/runtime\1/g, "\"@/lib/wails-runtime-shim\"");
		},
	};
}
*/

export default defineConfig(() => ({
	server  : {
		host       : "127.0.0.1",
		port       : Number(process.env.WAILS_VITE_PORT) || 9245,
		strictPort : true,
		hmr        : true,
	},
	plugins : [
		react(),
		wails("./bindings"),
		// wailsCallLogger(), // DONT REMOVE, this will enable wails runtime calls to be logged in the console, useful for debugging
		tailwindcss(),


		{
			name               : "inject-react-devtools",
			apply              : "serve",
			transformIndexHtml : {
				order   : "pre",
				handler : () => process.env.REACT_DEVTOOLS === "true" ? [
					{
						// Must be a classic script in head: it has to install the devtools hook
						// before React Refresh's preamble installs its own stub and wins.
						tag      : "script",
						attrs    : {src : "http://127.0.0.1:8097"},
						injectTo : "head-prepend",
					},
				] : [],
			},
		}
	],
	resolve : {
		alias : [
			{find : "@", replacement : path.resolve(__dirname, "./src")},
			{find : "@bindings", replacement : path.resolve(__dirname, "./bindings")},
		],
	},


	build : {
		// The only chunk over the default 500 kB is deckgl, which is lazy-loaded
		// with the world map — see world-map-panel.tsx.
		chunkSizeWarningLimit : 800,
		rolldownOptions       : {
			output : {
				codeSplitting : {
					groups : [
						{
							name     : "react-vendor",
							test     : /node_modules[\\/]react/,
							priority : 20,
						},
						{
							name     : "deckgl",
							test     : (id: string) => {
								const packages = [
									"@deck.gl",
									"@luma.gl",
									"@math.gl",
									"@loaders.gl",
									"@probe.gl",
									"gl-matrix",
								];

								return packages.some(pkg => id.includes(`node_modules/${pkg}`));
							},
							priority : 18,
						},
						{
							name     : "ui-vendor",
							test     : (id: string) => {
								const packages = [
									"@radix-ui",
									"@floating-ui",
									"shadcn",
									"tanstack",
									"tailwindcss",
									"dockview",
									"tailwind-merge",
									"tw-animate-css",
									"valtio",
									"valtio-persist",
									"valtio-reactive",
									"zod",
									"zod-to-json-schema",
								];

								return packages.some(pkg => id.includes(`node_modules/${pkg}`));
							},
							priority : 15,
						},
						{
							name     : "vendor",
							test     : /node_modules/,
							priority : 10,
						},
						{
							name          : "common",
							minShareCount : 2,
							minSize       : 10000,
							priority      : 5,
						},
					],
				},
//				codeSplitting : true,
			}
		}
	}

}));
