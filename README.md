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

##### `extension`
The extension that input files will have. Defaults to `css`.

##### `plugins`
Additional [PostCSS](https://github.com/postcss/postcss) plugins that will be applied to the input styles. May be either
an array or a hash with `before` and/or `after` keys, each containing an array of plugins.
Specifying only a plain array is shorthand for including those plugins in `after`.

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

##### `onProcessFile`
A callback that will be invoked whenever a file is about to be processed. Receives one argument:
 - `path`: the path of the file about to be processed

##### `formatCSS`
A function that will be invoked to determine the output format of the namespaced CSS for a module. Receives two arguments:
 - `namespacedCSS`: a string representing the processed CSS for a given module
 - `modulePath`: the relative path of the module to be formatted
The function should return a string representing the content to be written out. By default, the given CSS will be emitted with a leading content indicating the path of the original module.

##### `formatJS`
A function that will be invoked to determine the output format of class name mapping for a module. Receives two arguments:
 - `classMapping`: a hash mapping each original classname from the module to its namespaced equivalent(s)
 - `modulePath`: the relative path of the module to be formatted
The function should return a string representing the content to be written out. By default, the given object will be emitted as the default export of an ES6 module.

##### `postcssOptions`
A hash of options that will be passed directly through to the PostCSS processor. This allows the use of e.g. custom syntax in the processed files.
