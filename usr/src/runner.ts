#! /usr/bin/env node

import * as path from 'path';
import {getFileConstants, getFileList, runPackageCommand, getProcessArgs} from "@/utils";

type BuildEnv = {
    root: string,
    packages: string
}

const {env, args} = getProcessArgs<BuildEnv>(process.argv);

const command = args.shift();

const {__root, __dirname} = getFileConstants(import.meta.url, env.root ?? process.cwd());

env.packages ??= './packages';

if (command != null) {
    // Filtered list of `package.json` files from a specified directory.
    const packages: string[] = getFileList(path.resolve(__root, env.packages), __dirname)
        .filter((file: string) => !path.dirname(file).includes('node_modules') && path.basename(file) === 'package.json');

    await runPackageCommand(packages, command as string, args as string[]);
}