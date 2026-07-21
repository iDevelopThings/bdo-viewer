import js               from '@eslint/js';
import globals          from 'globals';
import reactHooks       from 'eslint-plugin-react-hooks';
import reactRefresh     from 'eslint-plugin-react-refresh';
import tseslint         from 'typescript-eslint';
import valtio           from 'eslint-plugin-valtio';
import { defineConfig } from 'eslint/config';


const strict = false;

const extraOpts = strict ? {
	extends         : [
		tseslint.configs.recommendedTypeChecked
	],
	languageOptions : {
		parserOptions : {
			projectService : {
				allowDefaultProject : ['vite.config.ts', 'eslint.config.js'],
			},
		}
	},
	rules           : {
		"@typescript-eslint/restrict-template-expressions" : [
			"error",
			{
				allowAny : true
			}
		],
		"@typescript-eslint/no-unnecessary-condition"      : "error",
		// Async handlers on JSX void attributes are fine (no-floating-promises is off too).
		'@typescript-eslint/no-misused-promises' : ['error', {checksVoidReturn : {attributes : false}}],
		
	}
} : {
	extends         : [
		tseslint.configs.recommended
	],
	languageOptions : {},
	rules           : {
		"@typescript-eslint/restrict-template-expressions" : 'off',
		"@typescript-eslint/no-unnecessary-condition"      : 'off',
		'@typescript-eslint/no-misused-promises'           : 'off',
	}
};

export default defineConfig(
	{
		// Generated (Wails bindings, *.gen.ts) and build output aren't ours to lint.
		ignores : ['dist', 'bindings', 'public', 'src/**/*.gen.ts'],
	},
	{
		files           : ['**/*.{ts,tsx}'],
		extends         : [
			js.configs.recommended,
			...extraOpts.extends,
		],
		languageOptions : {
			ecmaVersion : 2022,
			globals     : globals.browser,
			...extraOpts.languageOptions,
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
			'react-hooks/immutability' : 'off',
			// Always detects me using snapshot data inside effect/callback dependencies, which is a false positive.
			// Shit is annoying af
			'valtio/state-snapshot-rule'              : 'off',
			'react-hooks/exhaustive-deps'             : [
				'error',
				{
					additionalHooks : '(useAsync|useAsyncCallback)',
				},
			],
			'react-refresh/only-export-components'    : [
				'warn',
				{
					allowConstantExport : true,
				},
			],
			'@typescript-eslint/no-explicit-any'      : "off",
			'@typescript-eslint/no-floating-promises' : "off",
			
			"@typescript-eslint/consistent-type-imports" : [
				"error",
				{
					disallowTypeAnnotations : false,
					fixStyle                : 'separate-type-imports',
					prefer                  : 'type-imports',
				}
			],
			// no-explicit-any is off — `any` is allowed at the generated-binding (Source),
			// deck.gl and valtio interop boundaries, so the no-unsafe-* family (which errors
			// on every *use* of an any) is just noise. The rules that catch real bugs stay on.
			'@typescript-eslint/no-unsafe-member-access'       : 'off',
			'@typescript-eslint/no-unsafe-assignment'          : 'off',
			'@typescript-eslint/no-unsafe-call'                : 'off',
			'@typescript-eslint/no-unsafe-return'              : 'off',
			'@typescript-eslint/no-unsafe-argument'            : 'off',
			'@typescript-eslint/no-unsafe-declaration-merging' : 'off',
			'@typescript-eslint/no-empty-object-type'          : 'off',
			...extraOpts.rules,
		},
	},
	{
		files           : ['vite.config.ts', 'eslint.config.js'],
		languageOptions : {
			globals : globals.node,
		},
	},
);
