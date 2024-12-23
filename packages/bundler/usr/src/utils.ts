import path from "path";
import {InputOptions, ModuleFormat, OutputOptions, rollup} from "rollup";
import tsConfigPaths from "rollup-plugin-tsconfig-paths";
import {nodeResolve} from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";
import terser from "@rollup/plugin-terser";
import {resolvePath} from "@monk-js/utils";

/**
 * Bundler command environment
 */
export type BundlerEnv = {
    entry: string,
    root: string,
    dist: string,
    formats: string,
    config: string | false,
    external: string,
    sourceMap: boolean,
    module: string,
    minify: boolean,
    noJs: boolean,
    noDts: boolean
}

/**
 * Generates both ESM and CommonJS output formats, including minified versions
 * for a given module entry point.
 *
 * @param entry The path to the entry file to be bundled.
 * @param buildDir The directory where the output files will be generated.
 * @param basePath The base path to resolve file paths relative to.
 * @param env Environment variable
 */
export async function buildJs(entry: string, buildDir: string, basePath: string, env: Partial<BundlerEnv> = {}): Promise<void> {
    const sourceMap = env.sourceMap ?? false;
    const formats = env.formats ?? 'es:js,esm:mjs,cjs';
    const tsconfig = typeof env.config === 'string' ? resolvePath(path.resolve(env.config), basePath) : env.config ?? false;
    const external: (string | RegExp)[] = typeof env.external === 'string'
        ? env.external.startsWith('/') && env.external.endsWith('/')
            ? [new RegExp(env.external.substring(1, env.external.lastIndexOf('/')), env.external.substring(env.external.lastIndexOf('/') + 1))]
            : env.external.split(',')
        : [];
    external.push(/node_modules/);

    const input: InputOptions = {
        input: resolvePath(path.resolve(entry), basePath),
        external
    }

    const fileName = path.basename(entry);
    const extName = path.extname(fileName);
    const moduleName = env.module ?? fileName.substring(0, fileName.length - extName.length);

    console.log(`Building JS for entry: ${resolvePath(path.resolve(entry), basePath)}. Starting...`);
    const jobs: Promise<unknown>[] = [];

    const bundle = await rollup({
        ...input,
        plugins: [tsConfigPaths(), nodeResolve({preferBuiltins: true}), typescript({
            tsconfig,
            sourceMap
        })],
    });

    for (const _ of formats.split(',')) {
        // eslint-disable-next-line prefer-const
        let [format, ext] = _.split(':');
        ext ??= format;

        const output: OutputOptions = {
            file: resolvePath(path.resolve(buildDir, `${moduleName}.${ext}`), basePath),
            format: format as ModuleFormat,
            exports: "named",
            sourcemap: sourceMap,
        }

        const outputMin: OutputOptions = {
            ...output,
            plugins: [terser()]
        }

        jobs.push(!env.minify ? bundle.write(output) : bundle.write(outputMin));
    }

    await Promise.all(jobs);
    await bundle.close();

    console.log(`Build successful!`);
}

/**
 * Generates TypeScript declaration files (.d.ts) for a given module entry point.
 *
 * @param entry The path to the entry file to be bundled.
 * @param buildDir The directory where the output files will be generated.
 * @param basePath The base path to resolve file paths relative to.
 * @param env Environment variable
 */
export async function buildDts(entry: string, buildDir: string, basePath: string, env: Partial<BundlerEnv> = {}): Promise<void> {
    const tsconfig = typeof env.config === 'string' ? resolvePath(path.resolve(env.config), basePath) : env.config ?? false;
    const external: (string | RegExp)[] = typeof env.external === 'string'
        ? env.external.startsWith('/') && env.external.endsWith('/')
            ? [new RegExp(env.external.substring(1, env.external.lastIndexOf('/')), env.external.substring(env.external.lastIndexOf('/') + 1))]
            : env.external.split(',')
        : [];
    external.push(/node_modules/);

    const input: InputOptions = {
        input: resolvePath(path.resolve(entry), basePath),
        external
    }

    const fileName = path.basename(entry);
    const extName = path.extname(fileName);
    const moduleName = fileName.substring(0, fileName.length - extName.length);

    console.log(`Building .d.ts for entry: ${resolvePath(path.resolve(entry), basePath)}. Starting...`);

    const dtsOutput: OutputOptions = {
        file: resolvePath(path.resolve(buildDir, `${moduleName}.d.ts`), basePath),
        format: 'es',
        sourcemap: false
    }

    const dtsBundle = await rollup({
        ...input,
        plugins: [tsConfigPaths(), nodeResolve({preferBuiltins: true}), typescript({
            tsconfig,
            sourceMap: false,
        }), dts()],
    });
    await dtsBundle.write(dtsOutput);
    await dtsBundle.close();

    console.log(`Build successful!`);
}