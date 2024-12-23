# monk-js

Node.js utilities for monorepo management

## Install

```sh
# npm
npm install @monk-js/monk-js --save-dev

# yarn
yarn add -D @monk-js/monk-js
```

## Usage
```sh
# Bundle file in various formats
monk-bundle --entry ./index.ts [--formats es:js,esm:mjs,cjs --root ./ --dist ./dist --config tsconfig.json --minify --external "/@monk-js\/*/" --source-map --module main --no-dts] 

# Run command to all packages
monk-run [--root ./ --packages ./packages --uncheck *] yarn build

# Update version to all packages
monk-version [--root ./ --packages ./packages] --version 1.0.1
```