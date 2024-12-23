import path from "path";
import fs from "fs";
import {cpus} from "node:os";
import {CommandExecutionError, CommandLineError, PackageJson} from "@monk-js/runner";

/**
 * Version command environment
 */
export type VersionEnv = {
    root: string,
    packages: string,
    version: string,
}

/**
 * Updates package version
 * @param errors Errors array
 * @param version New version
 * @param file package.json file path
 */
export async function setPackageVersion(errors: CommandExecutionError[], version: string, file: string) {
    const buildDirectory = path.dirname(file);

    try {
        const packageInfo: PackageJson = JSON.parse(fs.readFileSync(file, 'utf-8'));
        console.log(`Package: ${packageInfo.name}. Starting...`);
        await null;
        packageInfo.version = version;
        fs.writeFileSync(file, JSON.stringify(packageInfo, null, 2));
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
 * @param version New package version
 * @returns `false` if no errors occurred, or an array of command error objects if errors were encountered.
 */
export async function updatePackageVersion(packages: string[], version: string): Promise<false | CommandExecutionError[]> {
    /**
     * Maximum number of threads available for processing.
     * It is calculated as half of the number of CPU cores (rounded) or a minimum of 2 threads.
     */
    const maxThreads = Math.max(Math.round(cpus().length / 2), 2);

    console.log(`Updating version to "${version}" using max threads: ${maxThreads}`);

    console.log(`Packages: ${packages.length}`);

    let processedFiles = 0;
    const packagesCopy = [...packages];

    const errors: CommandExecutionError[] = [];
    const buildCommand = setPackageVersion.bind(null, errors, version);

    while (packagesCopy.length > 0) {
        const chunk = packagesCopy.splice(0, maxThreads);
        console.log(`Processing packages: ${processedFiles + chunk.length} of ${packages.length}`);
        await Promise.allSettled(chunk.map(buildCommand));
        processedFiles += chunk.length;
    }

    if (errors.length > 0) {
        console.error(`Errors encountered during update:`, errors.length);
        return errors;
    }

    console.log(`Process completed successfully.`);
    return false;
}