import js               from '@eslint/js';
import globals          from 'globals';
import reactHooks       from 'eslint-plugin-react-hooks';
import reactRefresh     from 'eslint-plugin-react-refresh';
import tseslint         from 'typescript-eslint';
import valtio           from 'eslint-plugin-valtio';
import { defineConfig } from 'eslint/config';


export default defineConfig(
	{
		// Generated (Wails bindings, *.gen.ts) and build output aren't ours to lint.
		ignores : ['dist', 'bindings', 'public', 'src/**/*.gen.ts'],
	},
	{
		files           : ['**/*.{ts,tsx}'],
		extends         : [js.configs.recommended, tseslint.configs.recommended],
		languageOptions : {
			ecmaVersion : 2022,
			globals     : globals.browser,
		},
		plugins         : {
			'react-hooks'   : reactHooks,
			'react-refresh' : reactRefresh,
			'valtio'        : valtio,
		},
		rules           : {
			...reactHooks.configs['recommended-latest'].rules,
			...valtio.configs.recommended.rules,
			// valtio's model is mutating the proxy; flags every proxy write as a false positive.
			// The valtio plugin still guards the real mistake — mutating a snapshot.
			'react-hooks/immutability'             : 'off',
			// Always detects me using snapshot data inside effect/callback dependencies, which is a false positive.
			// Shit is annoying af
			'valtio/state-snapshot-rule'           : 'off',
			'react-hooks/exhaustive-deps'          : [
				'error',
				{
					additionalHooks : '(useAsync|useAsyncCallback)',
				},
			],
			'react-refresh/only-export-components' : [
				'warn',
				{
					allowConstantExport : true,
				},
			],
			'@typescript-eslint/no-explicit-any'   : 'off',
		},
	},
	{
		files           : ['vite.config.ts', 'eslint.config.js'],
		languageOptions : {
			globals : globals.node,
		},
	},
);
