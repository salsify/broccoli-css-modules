'use strict';

var fs = require('fs');
var path = require('path');

var mkdirp = require('mkdirp');
var assign = require('object-assign');
var postcss = require('postcss');
var LoaderCore = require('css-modules-loader-core');
var ModulesParser = require('css-modules-loader-core/lib/parser');
var LocalByDefault = require('postcss-modules-local-by-default');
var Promise = require('rsvp').Promise;
var Writer = require('broccoli-caching-writer');

module.exports = CSSModules;

function CSSModules(inputNode, _options) {
  if (!(this instanceof CSSModules)) { return new CSSModules(inputNode, _options); }

  Writer.call(this, [inputNode], options);

  var options = _options || {};

  this.plugins = unwrapPlugins(options.plugins || [], this);
  this.encoding = options.encoding || 'utf-8';
  this.generateScopedName = options.generateScopedName || LoaderCore.scope.generateScopedName;
  this.resolvePath = options.resolvePath || resolvePath;
  this.onProcessFile = options.onProcessFile;
  this.formatJS = options.formatJS;
  this.formatCSS = options.formatCSS;
  this.postcssOptions = options.postcssOptions || {};

  this._seen = null;
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

  if (this.onProcessFile) {
    this.onProcessFile(sourcePath);
  }

  return this.loadPath(sourcePath).then(function(result) {
    var dirname = path.dirname(destinationPath);
    var filename = path.basename(destinationPath).replace(/\.[^.]+$/, '');
    var css = this.formatInjectableSource(result.injectableSource, relativeSource);
    var js = this.formatExportTokens(result.exportTokens, relativeSource);

    mkdirp.sync(dirname);
    fs.writeFileSync(destinationPath, css, this.encoding);
    fs.writeFileSync(path.join(dirname, filename + '.js'), js, this.encoding);
  }.bind(this));
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
CSSModules.prototype.fetchExports = function(importString, fromFile) {
  var relativePath = importString.replace(/^['"]|['"]$/g, '');
  var absolutePath = this.resolvePath(relativePath, fromFile);

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

  var content = fs.readFileSync(absolutePath, this.encoding);
  return this.load(content, dependency, this.fetchExports.bind(this)).then(function(result) {
    return (seen[absolutePath] = result);
  });
};

CSSModules.prototype.generateRelativeScopedName = function(dependency, className, absolutePath, fullRule) {
  var relativePath = absolutePath.replace(this.inputPaths[0] + '/', '');
  return this.generateScopedName(className, relativePath, fullRule, dependency);
};

CSSModules.prototype.load = function(content, dependency, pathFetcher) {
  var parser = new ModulesParser(pathFetcher);
  var options = this.processorOptions({ from: '/' + dependency });
  var processor = postcss([]
      .concat(this.plugins.before)
      .concat(this.loaderPlugins(dependency))
      .concat([parser.plugin])
      .concat(this.plugins.after));

  return processor.process(content, options).then(function(result) {
    return { injectableSource: result.css, exportTokens: parser.exportTokens };
  });
};

CSSModules.prototype.processorOptions = function(additional) {
  return assign({}, additional, this.postcssOptions);
};

CSSModules.prototype.loaderPlugins = function(dependency) {
  return [
    LoaderCore.values,
    // LoaderCore is locked to exactly version 1.0.0 of LocalByDefault, so we require it explicitly
    LocalByDefault,
    LoaderCore.extractImports,
    LoaderCore.scope({
      generateScopedName: this.generateRelativeScopedName.bind(this, dependency)
    })
  ];
};

function resolvePath(relativePath, fromFile) {
  return path.resolve(path.dirname(fromFile), relativePath);
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
