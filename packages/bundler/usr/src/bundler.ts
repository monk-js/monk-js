#! /usr/bin/env node

import * as path from 'path';
import {buildJs, buildDts, getFileConstants, getProcessArgs} from "@monk-js/utils";

type BuildEnv = {
    entry: string,
    root: string,
    dist: string,
    formats: string,
    noJs: boolean,
    noDts: boolean
}

const {env, args} = getProcessArgs<BuildEnv>(process.argv);

const {__root, __dirname} = getFileConstants(import.meta.url, env.root ?? process.cwd());

env.dist ??= `./dist`;

if (env.entry) {
    if (!env.noJs) {
        await buildJs(path.resolve(__root, env.entry), path.resolve(__root, env.dist), __dirname, env.formats);
    }
    if (!env.noDts) {
        await buildDts(path.resolve(__root, env.entry), path.resolve(__root, env.dist), __dirname);
    }
}