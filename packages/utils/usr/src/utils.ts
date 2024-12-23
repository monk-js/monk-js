import path from "path";
import fs from "fs";
import {fileURLToPath} from "url";

/**
 * Script environment value
 */
export type ScriptEnvValue = string | number | boolean | null;

/**
 * Script environment
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

