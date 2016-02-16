'use strict';

var fs = require('fs');
var path = require('path');

var mkdirp = require('mkdirp');
var LoaderCore = require('css-modules-loader-core');
var Promise = require('rsvp').Promise;
var Writer = require('broccoli-caching-writer');

module.exports = CSSModules;

function CSSModules(inputNode, _options) {
  if (!(this instanceof CSSModules)) { return new CSSModules(inputNode, _options); }

  Writer.call(this, [inputNode], options);

  var options = _options || {};

  this.plugins = options.plugins || [];
  this.encoding = options.encoding || 'utf-8';
  this.generateScopedName = options.generateScopedName || LoaderCore.scope.generateScopedName;
  this.resolvePath = options.resolvePath || resolvePath;

  this._seen = null;
  this._loader = null;
}

CSSModules.prototype = Object.create(Writer.prototype);
CSSModules.prototype.constructor = CSSModules;

CSSModules.prototype.build = function() {
  this._seen = Object.create(null);

  // TODO this could cache much more than it currently does across rebuilds, but we'd need to be smart to invalidate
  // things correctly when dependencies change
  return Promise.all(this.listFiles().map(this.process.bind(this)));
};

CSSModules.prototype.process = function(sourcePath) {
  var relativeSource = sourcePath.substring(this.inputPaths[0].length + 1);
  var destinationPath = path.join(this.outputPath, relativeSource);

  return this.loadPath(sourcePath).then(function(result) {
    var dirname = path.dirname(destinationPath);
    var filename = path.basename(destinationPath, '.css');
    var css = cssWithModuleTag(relativeSource, result.injectableSource);
    var js = 'export default ' + JSON.stringify(result.exportTokens, null, 2) + ';';

    mkdirp.sync(dirname);
    fs.writeFileSync(destinationPath, css, this.encoding);
    fs.writeFileSync(path.join(dirname, filename + '.js'), js, this.encoding);
  }.bind(this));
};

// Hook for css-module-loader-core to fetch the exported tokens for a given import
CSSModules.prototype.fetchExports = function(importString, fromFile) {
  var relativePath = importString.replace(/^['"]|['"]$/g, '');
  var absolutePath = this.resolvePath(relativePath, fromFile);

  return this.loadPath(absolutePath).then(function(result) {
    return result.exportTokens;
  });
};

CSSModules.prototype.loadPath = function(absolutePath) {
  var seen = this._seen;
  if (seen[absolutePath]) {
    return Promise.resolve(seen[absolutePath]);
  }

  var content = fs.readFileSync(absolutePath, this.encoding);
  return this.loader().load(content, absolutePath, null, this.fetchExports.bind(this)).then(function(result) {
    return (seen[absolutePath] = result);
  });
};

CSSModules.prototype.generateRelativeScopedName = function(className, absolutePath, fullRule) {
  var relativePath = absolutePath.replace(this.inputPaths[0] + '/', '');
  return this.generateScopedName(className, relativePath, fullRule);
};

CSSModules.prototype.loader = function() {
  if (!this._loader) {
    this._loader = new LoaderCore([
      LoaderCore.values,
      LoaderCore.localByDefault,
      LoaderCore.extractImports,
      LoaderCore.scope({
        generateScopedName: this.generateRelativeScopedName.bind(this)
      })
    ].concat(this.plugins));
  }

  return this._loader;
};

function resolvePath(relativePath, fromFile) {
  return path.resolve(path.dirname(fromFile), relativePath);
}

// A cheap (but fast) substitute for actual source maps
function cssWithModuleTag(modulePath, css) {
  return '/* styles for ' + modulePath + ' */\n' + css;
}
