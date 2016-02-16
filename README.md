# broccoli-css-modules [![Build Status](https://travis-ci.org/salsify/broccoli-css-modules.svg?branch=master)](https://travis-ci.org/salsify/broccoli-css-modules)
A Broccoli plugin for compiling [CSS Modules](https://github.com/css-modules/css-modules).

## Usage

Given a Broccoli tree containing CSS files, this plugin will emit a tree containing scoped versions of those files alongside a `.js` file for each containing a mapping of the original class names to the scoped ones.

```js
var CSSModules = require('broccoli-css-modules');

var compiled = new CSSModules(inputCSS, {
  // options
});
```

## Configuration

All configuration parameters listed below are optional.

##### `encoding`
The assumed character encoding for all files being processed. Defaults to `utf-8`.

##### `plugins`
An array of [PostCSS](https://github.com/postcss/postcss) plugins that will also be applied during transformation.

##### `generateScopedName`
A callback to generate the scoped version of an identifier. Receives two arguments:
 - `name`: the identifier to be scoped
 - `path`: the location of the module containing the identifier
The function should return a string that uniquely globally identifies this name originating from the given module.

##### `resolvePath`
A callback to resolve a given import path from one file to another. Receives two arguments:
 - `importPath`: the path from which to import, as specified in the importing module
 - `fromFile`: the absolute path of the importing module
The function should return an absolute path where the contents of the target imported module can be located.
