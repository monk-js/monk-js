#! /usr/bin/env node

import * as path from 'path';
import {getFileConstants, getProcessArgs} from "@monk-js/utils";
import {buildDts, BundlerEnv, buildJs} from "@/utils";

const {env, args} = getProcessArgs<BundlerEnv>(process.argv);

const {__root, __dirname} = getFileConstants(import.meta.url, env.root ?? process.cwd());

env.dist ??= `./dist`;

if (env.entry) {
    if (!env.noJs) {
        await buildJs(path.resolve(__root, env.entry), path.resolve(__root, env.dist), __dirname, env);
    }
    if (!env.noDts) {
        await buildDts(path.resolve(__root, env.entry), path.resolve(__root, env.dist), __dirname, env);
    }
}