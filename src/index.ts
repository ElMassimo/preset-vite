import { Plugin } from "vite";
import resolve from "resolve";
import prefresh from "@prefresh/vite";
import * as babel from "@babel/core";
import { preactDevtoolsPlugin } from "./devtools.js";
import { hookNamesPlugin } from "./hook-names.js";
import { ParserPlugin } from "@babel/parser";

export interface PreactPluginOptions {
	devtoolsInProd?: boolean;
}

// Taken from https://github.com/vitejs/vite/blob/main/packages/plugin-react/src/index.ts
export default function preactPlugin({
	devtoolsInProd,
}: PreactPluginOptions = {}): Plugin[] {
	let projectRoot: string = process.cwd();
	const jsxPlugin: Plugin = {
		name: "vite:preact-jsx",
		enforce: "pre",
		config() {
			return {
				optimizeDeps: {
					include: ["preact/jsx-runtime"],
				},
			};
		},
		configResolved(config) {
			projectRoot = config.root;
		},
		resolveId(id: string) {
			return id === "preact/jsx-runtime" ? id : null;
		},
		load(id: string) {
			if (id === "preact/jsx-runtime") {
				const runtimePath = resolve.sync("preact/jsx-runtime", {
					basedir: projectRoot,
				});
				const exports = ["jsx", "jsxs", "Fragment"];
				return [
					`import * as jsxRuntime from ${JSON.stringify(runtimePath)}`,
					// We can't use `export * from` or else any callsite that uses
					// this module will be compiled to `jsxRuntime.exports.jsx`
					// instead of the more concise `jsx` alias.
					...exports.map(name => `export const ${name} = jsxRuntime.${name}`),
				].join("\n");
			}
		},
		transform(code, id) {
			if (/\.[tj]sx?$/.test(id) && !id.includes("node_modules")) {
				const parserPlugins = [
					"importMeta",
					// This plugin is applied before esbuild transforms the code,
					// so we need to enable some stage 3 syntax that is supported in
					// TypeScript and some environments already.
					"topLevelAwait",
					"classProperties",
					"classPrivateProperties",
					"classPrivateMethods",
					!id.endsWith(".ts") && "jsx",
					/\.tsx?$/.test(id) && "typescript",
				].filter(Boolean) as ParserPlugin[];

				const result = babel.transformSync(code, {
					babelrc: false,
					configFile: false,
					ast: true,
					root: projectRoot,
					filename: id,
					parserOpts: {
						sourceType: "module",
						allowAwaitOutsideFunction: true,
						plugins: parserPlugins,
					},
					generatorOpts: {
						decoratorsBeforeExport: true,
					},
					plugins: [
						[
							"@babel/plugin-transform-react-jsx",
							{
								runtime: "automatic",
								importSource: "preact",
							},
						],
					],
					sourceMaps: true,
					inputSourceMap: false as any,
				});

				if (!result) return { code };

				return {
					code: result.code || code,
					map: result.map,
				};
			}
			return undefined;
		},
	};
	return [
		{
			name: "preact:config",
			config() {
				return {
					resolve: {
						alias: {
							"react-dom/test-utils": "preact/test-utils",
							"react-dom": "preact/compat",
							react: "preact/compat",
						},
					},
				};
			},
		},
		jsxPlugin,
		preactDevtoolsPlugin({ injectInProd: devtoolsInProd }),
		prefresh(),
		hookNamesPlugin(),
	];
}
