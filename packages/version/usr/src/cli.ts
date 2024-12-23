#! /usr/bin/env node

import * as path from 'path';
import {getFileConstants, getFileList, getProcessArgs} from "@monk-js/utils";
import {updatePackageVersion, VersionEnv} from "@/utils";
import * as process from "node:process";

const {env, args} = getProcessArgs<VersionEnv>(process.argv);

const {__root, __dirname} = getFileConstants(import.meta.url, env.root ?? process.cwd());

env.packages ??= './packages';

if (env.version != null) {
    // Filtered list of `package.json` files from a specified directory.
    const packages: string[] = getFileList(path.resolve(__root, env.packages), __dirname)
        .filter((file: string) => !path.dirname(file).includes('node_modules') && path.basename(file) === 'package.json');

    if (!await updatePackageVersion(packages, env.version)) {
        process.exit(1)
    }
}