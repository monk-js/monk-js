import path from "path";
import fs from "fs";
import process from "process";
import {fileURLToPath} from "url";
import {InputOptions, ModuleFormat, OutputOptions, rollup} from "rollup";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import dts from "rollup-plugin-dts";
import {spawn, SpawnOptions} from "node:child_process";
import { cpus } from "node:os";

/**
 * Error that occurs during the execution of a command-line process.
 */
export type CommandLineError = {
    stdout: string,
    stderr: string,
    code: number
}
/**
 * Error encountered during a process
 */
export type CommandExecutionError = {
    file: string;
    error: CommandLineError;
};

/**
 * Package JSON file
 */
export interface PackageJson {
    name: string;
    version: string;
}

/**
 * Значение параметров скрипта
 */
export type ScriptEnvValue = string | number | boolean | null;

/**
 * Параметры скрипта
 */
export type ScriptEnv = Record<string, ScriptEnvValue>;

/**
 * Resolves the relative path of a file.
 * Converts to Unix-style path separators if on Windows.
 *
 * @param file The target file path.
 * @param basePath Base path for resolution
 * @returns The resolved file path.
 */
export function resolvePath(file: string, basePath: string): string {
    const normalizedPath = path.resolve(basePath, file);
    return path.win32 ? normalizedPath.replace(/\\/g, '/') : normalizedPath;
}

/**
 * Converts a given string to camelCase format based on the specified delimiter.
 *
 * @param value The input string to be converted.
 * @param delim The delimiter used to separate words in the input string.
 * @returns The converted string in camelCase format.
 */
export function convertToCamelCase(value: string, delim: string = '_'): string {
    return value?.toLowerCase()
        .split(delim)
        .map((word: string, ind: number) => (ind > 0 ? word.charAt(0)
            .toUpperCase() + word.substring(1) : word))
        .join('');
}

/**
 * Parses the given process arguments into a structured format, separating environmental parameters
 * and standalone arguments.
 *
 * @param processArgs The list of process arguments to parse, typically including script name and its parameters.
 * @returns An object containing:
 *         - `env`: A partial object mapping parameter keys to their corresponding values or flags.
 *         - `args`: An array of standalone argument values derived from the input.
 */
export function getProcessArgs<Env extends ScriptEnv = ScriptEnv, Args extends ScriptEnvValue[] = ScriptEnvValue[]>(processArgs: string[]): {
    env: Partial<Env>,
    args: Args,
} {
    const args: ScriptEnvValue[] = [];
    const env: Record<string, ScriptEnvValue> = {};
    let key: string | null = null;
    let value: ScriptEnvValue = null;
    // Skip first two argument, basically its node path and file path
    for (let i = 2; i < processArgs.length; i++) {
        // Parameter starts with "--" and don't contain "="
        if (processArgs[i].indexOf('--') == 0 && !processArgs[i].includes('=')) {
            // If previous parameter has no value, then this is boolean parameter
            if (key != null) {
                env[key] = true;
            }
            // Save parameter name
            key = convertToCamelCase(processArgs[i].substring(2), '-');
        } else {
            if (processArgs[i].indexOf('--') == 0 && processArgs[i].indexOf('=') != -1) {
                // If previous parameter has no value, then this is boolean parameter
                if (key != null) {
                    env[key] = true;
                }
                // Save parameter name
                key = convertToCamelCase(processArgs[i].substring(2, processArgs[i].indexOf('=')), '-');
                value = processArgs[i].substring(processArgs[i].indexOf('=') + 1);
            } else {
                // Get parameter value
                value = processArgs[i];
            }
            // Convert string to native type
            switch (value.toLowerCase()) {
                case 'true':
                    value = true;
                    break;
                case 'false':
                    value = false;
                    break;
                case 'null':
                    value = null;
                    break;
                default:
                    // Maybe it's number
                    if (parseInt(value).toString() == value) {
                        value = parseInt(value);
                    } else if (parseFloat(value).toString() == value) {
                        value = parseFloat(value);
                    }
            }
            // If previous parameter has key, then this is value
            if (key != null) {
                env[key] = value;
                key = null;
            } else {
                // It's argument
                args.push(value);
            }
        }
    }
    // If previous parameter has no value, then this is boolean parameter
    if (key != null) {
        env[key] = true;
    }
    return {
        env,
        args
    } as {
        env: Partial<Env>,
        args: Args,
    };
}

/**
 * Recursively find all files in a given directory.
 * @param directory Target directory
 * @param basePath Base path for resolution
 */
export function getFileList(directory: string, basePath: string): string[] {
    const allFiles: string[] = [];
    const dirItems = fs.readdirSync(path.resolve(basePath, directory), {withFileTypes: true});

    for (const item of dirItems) {
        const itemPath = path.resolve(basePath, path.join(directory, item.name));
        if (item.isDirectory()) {
            allFiles.push(...getFileList(path.join(directory, item.name), basePath));
        } else {
            allFiles.push(itemPath);
        }
    }

    return allFiles;
}

/**
 * Executes a command in a child process with specified arguments and options.
 *
 * @param command The command to be executed.
 * @param args An array of string arguments passed to the command.
 * @param options Options to configure the spawn behavior.
 */
export function processSpawn(command: string, args: string[], options: SpawnOptions): Promise<string | CommandLineError> {
    const child = spawn(command, args, options);
    let stdout = '';
    let stderr = '';

    const handleStream = (stream: NodeJS.ReadableStream | null, onData: (data: string) => void) => {
        stream?.on('data', data => onData(data.toString()));
    };

    handleStream(child.stdout, data => {
        stdout += data;
    });
    handleStream(child.stderr, data => {
        stderr += data;
    });

    return new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject({stdout, stderr, code});
            }
        });
    });
}

/**
 * Builds package
 *
 * @param file package.json file path
 * @param errors Errors array
 * @param command Command
 * @param args Command arguments
 */
export async function executePackageCommand(errors: CommandExecutionError[], command: string, args: string[], file: string) {
    const buildDirectory = path.dirname(file);

    try {
        const targetDir = path.resolve(buildDirectory);
        const packageInfo: PackageJson = JSON.parse(fs.readFileSync(file, 'utf-8'));
        process.chdir(targetDir);
        console.log(`Package: ${packageInfo.name}. Starting...`);
        await processSpawn(command, args, {shell: true});
        console.log(`Package: ${packageInfo.name}. Successful!`);
    } catch (e: unknown) {
        const error: CommandLineError = e as unknown as CommandLineError;
        console.error(`Package: ${buildDirectory}. ERROR!`);
        console.error(error?.stderr || error?.stdout || error);
        errors.push({file: buildDirectory, error});
    }
}

/**
 * Executes a specified package command in parallel with a limited number of threads.
 *
 * @param packages Package file list.
 * @param command The process to execute.
 * @param args An array of arguments to be passed to the command.
 * @returns `false` if no errors occurred, or an array of command error objects if errors were encountered.
 */
export async function runPackageCommand(packages: string[], command: string, args: string[]): Promise<false | CommandExecutionError[]> {
    /**
     * Maximum number of threads available for processing.
     * It is calculated as half of the number of CPU cores (rounded) or a minimum of 2 threads.
     */
    const maxThreads = Math.max(Math.round(cpus().length / 2), 2);

    console.log(`Running "${command} ${args.join(' ')}" using max threads: ${maxThreads}`);

    console.log(`Packages: ${packages.length}`);

    let processedFiles = 0;
    const packagesCopy = [...packages];

    // Save current working directory of the Node.js process
    const cwd = process.cwd();
    const errors: CommandExecutionError[] = [];
    const buildCommand = executePackageCommand.bind(null, errors, command, args);

    while (packagesCopy.length > 0) {
        const chunk = packagesCopy.splice(0, maxThreads);
        console.log(`Processing packages: ${processedFiles + chunk.length} of ${packages.length}`);
        await Promise.allSettled(chunk.map(buildCommand));
        processedFiles += chunk.length;
    }

    // Restore current directory
    process.chdir(cwd);

    if (errors.length > 0) {
        console.error(`Errors encountered during ${command} ${args.join(' ')}:`, errors.length);
        return errors;
    }

    console.log(`Process completed successfully.`);
    return false;
}

/**
 * Retrieves constants related to the current file's path including its filename, directory,
 * root directory, and an optional relative path.
 *
 * @param __file The path to the file (usually import.meta.url).
 * @param __relative A relative path used to compute the root directory.
 * @return An object containing the resolved file path (__filename), directory path (__dirname),
 *         root directory (__root), and relative path (__relative).
 */
export function getFileConstants(__file: string, __relative = './'): {
    __filename: string;
    __dirname: string;
    __root: string;
    __relative: string;
} {
    // Current file name
    const __filename = path.resolve(fileURLToPath(__file));
    // Current dir
    const __dirname = path.resolve(path.dirname(__filename));
    // Root folder
    const __root = path.resolve(__dirname, __relative);

    return {
        __filename,
        __dirname,
        __root,
        __relative
    }
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
export async function buildJs(entry: string, buildDir: string, basePath: string, env: Partial<{formats: string, config: string | false, external: string}> = {}): Promise<void> {
    const formats =  env.formats ?? 'es:js,esm:mjs,cjs';
    const tsconfig = typeof env.config === 'string' ? resolvePath(path.resolve(env.config), basePath) : env.config ?? false;
    const external = typeof env.external === 'string'
        ? env.external.startsWith('/') && env.external.endsWith('/')
            ? new RegExp(env.external.substring(1, env.external.lastIndexOf('/')), env.external.substring(env.external.lastIndexOf('/')+1))
            : env.external.split(',')
        : /node_modules/;

    const input: InputOptions = {
        input: resolvePath(path.resolve(entry), basePath),
        external
    }

    const fileName = path.basename(entry);
    const extName = path.extname(fileName);
    const moduleName = fileName.substring(0, fileName.length - extName.length);

    console.log(`Building module: ${moduleName}. Starting...`);
    const jobs: Promise<unknown>[] = [];

    const bundle = await rollup({
        ...input,
        plugins: [nodeResolve(), typescript({
            tsconfig
        })],
    });

    for(const _ of formats.split(',')) {
        // eslint-disable-next-line prefer-const
        let [format, ext] = _.split(':');
        ext ??= format;

        const output: OutputOptions = {
            file: resolvePath(path.resolve(buildDir, `${moduleName}.${ext}`), basePath),
            format: format as ModuleFormat,
            sourcemap: true,
        }

        const outputMin: OutputOptions = {
            ...output,
            file: resolvePath(path.resolve(buildDir, `${moduleName}.min.${ext}`), basePath),
            plugins: [terser()]
        }

        jobs.push(bundle.write(output));
        jobs.push(bundle.write(outputMin));
    }

    await Promise.all(jobs);
    await bundle.close();

    console.log(`Building module: ${moduleName}. Successfully!`);
}

/**
 * Generates TypeScript declaration files (.d.ts) for a given module entry point.
 *
 * @param entry The path to the entry file to be bundled.
 * @param buildDir The directory where the output files will be generated.
 * @param basePath The base path to resolve file paths relative to.
 * @param env Environment variable
 */
export async function buildDts(entry: string, buildDir: string, basePath: string, env: Partial<{formats: string, config: string | false, external: string}> = {}): Promise<void> {
    const tsconfig = typeof env.config === 'string' ? resolvePath(path.resolve(env.config), basePath) : env.config ?? false;
    const external = typeof env.external === 'string'
        ? env.external.startsWith('/') && env.external.endsWith('/')
            ? new RegExp(env.external.substring(1, env.external.lastIndexOf('/')), env.external.substring(env.external.lastIndexOf('/')+1))
            : env.external.split(',')
        : /node_modules/;

    const input: InputOptions = {
        input: resolvePath(path.resolve(entry), basePath),
        external
    }

    const fileName = path.basename(entry);
    const extName = path.extname(fileName);
    const moduleName = fileName.substring(0, fileName.length - extName.length);

    console.log(`Building module meta: ${moduleName}. Starting...`);

    const dtsOutput: OutputOptions = {
        file: resolvePath(path.resolve(buildDir, `${moduleName}.d.ts`), basePath),
        format: 'es',
        sourcemap: false
    }

    const dtsBundle = await rollup({
        ...input,
        plugins: [nodeResolve(), typescript({
            tsconfig
        }), dts()],
    });
    await dtsBundle.write(dtsOutput);
    await dtsBundle.close();

    console.log(`Building module meta: ${moduleName}. Successfully!`);
}