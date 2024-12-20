import path from "path";
import fs from "fs";
import process from "process";
import {cpus} from "node:os";
import {spawn, SpawnOptions} from "node:child_process";

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
 * @param errors Errors array
 * @param command Command
 * @param args Command arguments
 * @param file package.json file path
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