'use strict';

const fs = require('fs');
const path = require('path');

const Promise = require('rsvp').Promise;
const Writer = require('broccoli-caching-writer');
const mkdirp = require('mkdirp');
const symlinkOrCopy = require('symlink-or-copy');
const ensurePosixPath = require('ensure-posix-path');

const postcss = require('postcss');
const linkModules = require('./lib/link-modules');

const values = require('postcss-modules-values');
const localByDefault = require('postcss-modules-local-by-default');
const extractImports = require('postcss-modules-extract-imports');
const scope = require('postcss-modules-scope');

module.exports = class CSSModules extends Writer {
  constructor(inputNode, _options) {
    super([inputNode], _options);

    let options = _options || {};

    this.plugins = unwrapPlugins(options.plugins || []);
    this.encoding = options.encoding || 'utf-8';
    this.extension = options.extension || 'css';
    this.generateScopedName = options.generateScopedName || scope.generateScopedName;
    this.resolvePath = options.resolvePath || resolvePath;
    this.onProcessFile = options.onProcessFile;
    this.formatJS = options.formatJS;
    this.formatCSS = options.formatCSS;
    this.enableSourceMaps = options.enableSourceMaps;
    this.sourceMapBaseDir = options.sourceMapBaseDir;
    this.postcssOptions = options.postcssOptions || {};
    this.virtualModules = options.virtualModules || Object.create(null);
    this.onModuleResolutionFailure = options.onModuleResolutionFailure || function(failure) { throw failure; };
    this.onImportResolutionFailure = options.onImportResolutionFailure;

    this.onBuildStart = options.onBuildStart || (() => {});
    this.onBuildEnd = options.onBuildEnd || (() => {});
    this.onBuildSuccess = options.onBuildSuccess || (() => {});
    this.onBuildError = options.onBuildError || (() => {});

    this._seen = null;
  }

  build() {
    this._seen = Object.create(null);
    this.onBuildStart();

    // TODO this could cache much more than it currently does across rebuilds, but we'd need to be smart to invalidate
    // things correctly when dependencies change
    let processPromises = this.listFiles().map((sourcePath) => {
      return this.process(ensurePosixPath(sourcePath));
    });

    return Promise.all(processPromises)
      .then((result) => {
        this.onBuildSuccess();
        this.onBuildEnd();
        return result;
      })
      .catch((error) => {
        this.onBuildError();
        this.onBuildEnd();
        throw error;
      });
  }

  process(sourcePath) {
    let relativeSource = sourcePath.substring(this.inputPaths[0].length + 1);
    let destinationPath = this.outputPath + '/' + relativeSource;

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
      let dirname = path.dirname(destinationPath);
      let filename = path.basename(destinationPath, '.' + this.extension);
      let css = this.formatInjectableSource(result.injectableSource, relativeSource);
      let js = this.formatExportTokens(result.exportTokens, relativeSource);

      mkdirp.sync(dirname);
      fs.writeFileSync(destinationPath, css, this.encoding);
      fs.writeFileSync(path.join(dirname, filename + '.js'), js, this.encoding);
    }.bind(this));
  }

  posixInputPath() {
    return ensurePosixPath(this.inputPaths[0]);
  }

  formatExportTokens(exportTokens, modulePath) {
    if (this.formatJS) {
      return this.formatJS(exportTokens, modulePath);
    } else {
      return 'export default ' + JSON.stringify(exportTokens, null, 2) + ';';
    }
  }

  formatInjectableSource(injectableSource, modulePath) {
    if (this.formatCSS) {
      return this.formatCSS(injectableSource, modulePath);
    } else if (this.enableSourceMaps) {
      return injectableSource;
    } else {
      return '/* styles for ' + modulePath + ' */\n' + injectableSource;
    }
  }

  // Hook for css-module-loader-core to fetch the exported tokens for a given import
  fetchExports(importPath, fromFile) {
    let relativePath = ensurePosixPath(importPath);

    if (relativePath in this.virtualModules) {
      return Promise.resolve(this.virtualModules[relativePath]);
    }

    let absolutePath = this.resolvePath(relativePath, ensurePosixPath(fromFile));
    return this.loadPath(absolutePath).then(function(result) {
      return result.exportTokens;
    });
  }

  loadPath(dependency) {
    let seen = this._seen;
    let absolutePath = dependency.toString();
    let loadPromise = seen[absolutePath];

    if (!loadPromise) {
      loadPromise = new Promise(function(resolve) {
        let content = fs.readFileSync(absolutePath, this.encoding);
        resolve(this.load(content, dependency));
      }.bind(this));
      seen[absolutePath] = loadPromise;
    }

    return loadPromise;
  }

  generateRelativeScopedName(dependency, className, absolutePath, fullRule) {
    let relativePath = ensurePosixPath(absolutePath).replace(this.posixInputPath() + '/', '');
    return this.generateScopedName(className, relativePath, fullRule, dependency);
  }

  load(content, dependency) {
    let options = this.processorOptions({
      from: dependency.toString(),
      map: this.sourceMapOptions()
    });

    let processor = postcss([]
        .concat(this.plugins.before)
        .concat(this.loaderPlugins(dependency))
        .concat(this.plugins.after));

    return processor.process(content, options).then(function(result) {
      return { injectableSource: result.css, exportTokens: result.exportTokens };
    });
  }

  processorOptions(additional) {
    return Object.assign({}, additional, this.postcssOptions);
  }

  sourceMapOptions() {
    if (!this.enableSourceMaps) return;

    let dir = this.sourceMapBaseDir ? ('/' + ensurePosixPath(this.sourceMapBaseDir)) : '';

    return {
      inline: true,
      sourcesContent: true,
      annotation: this.posixInputPath() + dir + '/output.map'
    };
  }

  loaderPlugins(dependency) {
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
  }
};

function resolvePath(relativePath, fromFile) {
  return ensurePosixPath(path.resolve(path.dirname(fromFile), relativePath));
}

function unwrapPlugins(plugins) {
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
