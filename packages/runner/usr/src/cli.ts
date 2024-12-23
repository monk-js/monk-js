#! /usr/bin/env node

import * as path from 'path';
import {getFileConstants, getFileList, getProcessArgs} from "@monk-js/utils";
import {RunnerEnv, runPackageCommand} from "@/utils";

const {env, args} = getProcessArgs<RunnerEnv>(process.argv);

const command = args.shift();

const {__root, __dirname} = getFileConstants(import.meta.url, env.root ?? process.cwd());

env.packages ??= './packages';

if (command != null) {
    // Filtered list of `package.json` files from a specified directory.
    const packages: string[] = getFileList(path.resolve(__root, env.packages), __dirname)
        .filter((file: string) => !path.dirname(file).includes('node_modules') && path.basename(file) === 'package.json');

    if (!await runPackageCommand(env, packages, command as string, args as string[])) {
        process.exit(1);
    }
}