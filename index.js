'use strict';

var fs = require('fs');
var path = require('path');

var Promise = require('rsvp').Promise;
var Writer = require('broccoli-caching-writer');
var mkdirp = require('mkdirp');
var assign = require('object-assign');
var symlinkOrCopy = require('symlink-or-copy');
var ensurePosixPath = require('ensure-posix-path');

var postcss = require('postcss');
var linkModules = require('./lib/link-modules');

var values = require('postcss-modules-values');
var localByDefault = require('postcss-modules-local-by-default');
var extractImports = require('postcss-modules-extract-imports');
var scope = require('postcss-modules-scope');

module.exports = CSSModules;

function CSSModules(inputNode, _options) {
  if (!(this instanceof CSSModules)) { return new CSSModules(inputNode, _options); }

  Writer.call(this, [inputNode], options);

  var options = _options || {};

  this.plugins = unwrapPlugins(options.plugins || [], this);
  this.encoding = options.encoding || 'utf-8';
  this.extension = options.extension || 'css';
  this.generateScopedName = options.generateScopedName || scope.generateScopedName;
  this.resolvePath = options.resolvePath || resolvePath;
  this.onProcessFile = options.onProcessFile;
  this.formatJS = options.formatJS;
  this.formatCSS = options.formatCSS;
  this.postcssOptions = options.postcssOptions || {};
  this.virtualModules = options.virtualModules || Object.create(null);
  this.onModuleResolutionFailure = options.onModuleResolutionFailure || function(failure) { throw failure; };
  this.onImportResolutionFailure = options.onImportResolutionFailure;

  this._seen = null;
}

CSSModules.prototype = Object.create(Writer.prototype);
CSSModules.prototype.constructor = CSSModules;

CSSModules.prototype.build = function() {
  this._seen = Object.create(null);

  // TODO this could cache much more than it currently does across rebuilds, but we'd need to be smart to invalidate
  // things correctly when dependencies change
  return Promise.all(this.listFiles().map(function(sourcePath) {
    return this.process(ensurePosixPath(sourcePath));
  }.bind(this)));
};

CSSModules.prototype.process = function(sourcePath) {
  var relativeSource = sourcePath.substring(this.inputPaths[0].length + 1);
  var destinationPath = this.outputPath + '/' + relativeSource;

  // If the file isn't an extension we care about, just copy it over untouched
  if (sourcePath.lastIndexOf('.' + this.extension) !== sourcePath.length - this.extension.length - 1) {
    mkdirp.sync(path.dirname(destinationPath));
    symlinkOrCopy.sync(sourcePath, destinationPath);
    return;
  }

  if (this.onProcessFile) {
    this.onProcessFile(sourcePath);
  }

  return this.loadPath(sourcePath).then(function(result) {
    var dirname = path.dirname(destinationPath);
    var filename = path.basename(destinationPath, '.' + this.extension);
    var css = this.formatInjectableSource(result.injectableSource, relativeSource);
    var js = this.formatExportTokens(result.exportTokens, relativeSource);

    mkdirp.sync(dirname);
    fs.writeFileSync(destinationPath, css, this.encoding);
    fs.writeFileSync(path.join(dirname, filename + '.js'), js, this.encoding);
  }.bind(this));
};

CSSModules.prototype.posixInputPath = function() {
  return ensurePosixPath(this.inputPaths[0]);
};

CSSModules.prototype.formatExportTokens = function(exportTokens, modulePath) {
  if (this.formatJS) {
    return this.formatJS(exportTokens, modulePath);
  } else {
    return 'export default ' + JSON.stringify(exportTokens, null, 2) + ';';
  }
};

CSSModules.prototype.formatInjectableSource = function(injectableSource, modulePath) {
  if (this.formatCSS) {
    return this.formatCSS(injectableSource, modulePath);
  } else {
    return '/* styles for ' + modulePath + ' */\n' + injectableSource;
  }
};

// Hook for css-module-loader-core to fetch the exported tokens for a given import
CSSModules.prototype.fetchExports = function(importPath, fromFile) {
  var relativePath = ensurePosixPath(importPath);

  if (relativePath in this.virtualModules) {
    return Promise.resolve(this.virtualModules[relativePath]);
  }

  var absolutePath = this.resolvePath(relativePath, ensurePosixPath(fromFile));
  return this.loadPath(absolutePath).then(function(result) {
    return result.exportTokens;
  });
};

CSSModules.prototype.loadPath = function(dependency) {
  var seen = this._seen;
  var absolutePath = dependency.toString();
  if (seen[absolutePath]) {
    return Promise.resolve(seen[absolutePath]);
  }

  try {
    var content = fs.readFileSync(absolutePath, this.encoding);
    return this.load(content, dependency).then(function(result) {
      return (seen[absolutePath] = result);
    });
  } catch (error) {
    return Promise.reject(error);
  }
};

CSSModules.prototype.generateRelativeScopedName = function(dependency, className, absolutePath, fullRule) {
  var relativePath = ensurePosixPath(absolutePath).replace(this.posixInputPath() + '/', '');
  return this.generateScopedName(className, relativePath, fullRule, dependency);
};

CSSModules.prototype.load = function(content, dependency) {
  var options = this.processorOptions({ from: dependency.toString() });
  var processor = postcss([]
      .concat(this.plugins.before)
      .concat(this.loaderPlugins(dependency))
      .concat(this.plugins.after));

  return processor.process(content, options).then(function(result) {
    return { injectableSource: result.css, exportTokens: result.exportTokens };
  });
};

CSSModules.prototype.processorOptions = function(additional) {
  return assign({}, additional, this.postcssOptions);
};

CSSModules.prototype.loaderPlugins = function(dependency) {
  return [
    values,
    localByDefault,
    extractImports,
    scope({
      generateScopedName: this.generateRelativeScopedName.bind(this, dependency)
    }),
    linkModules({
      fetchExports: this.fetchExports.bind(this),
      onModuleResolutionFailure: this.onModuleResolutionFailure,
      onImportResolutionFailure: this.onImportResolutionFailure
    })
  ];
};

function resolvePath(relativePath, fromFile) {
  return ensurePosixPath(path.resolve(path.dirname(fromFile), relativePath));
}

function unwrapPlugins(plugins, owner) {
  if (Array.isArray(plugins)) {
    return {
      before: [],
      after: plugins
    };
  } else {
    return {
      before: plugins.before || [],
      after: plugins.after || []
    };
  }
}

function makeLoadCallback(owner) {
  return function load(path) {
    return owner.loadPath(path).then(function(result) {
      return result.injectableSource;
    });
  };
}
