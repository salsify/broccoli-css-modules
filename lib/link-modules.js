'use strict';

/*
 * The contents of this file are based on the Parser module in css-modules-loader-core.
 * It takes a module in ICSS format (see https://github.com/css-modules/icss#specification),
 * locates and replaces all imported symbols with their global munged names, and records
 * any exported symbols from the module for the same purpose.
 */

const Promise = require('rsvp').Promise;
const postcss = require('postcss');
const replaceSymbols = require('icss-replace-symbols').default;

module.exports = postcss.plugin('link-modules', (options) => {
  return (css, result) => {
    let translations = {};
    let exportTokens = result.exportTokens = {};

    return Promise.all(fetchAllImports(css, translations, options))
      .then(replaceSymbols.bind(null, css, translations))
      .then(extractExports.bind(null, css, translations, exportTokens));
  };
});

const IMPORT_REGEXP = /^:import\((.+)\)$/;

function fetchAllImports(css, translations, options) {
  let imports = [];
  css.each((node) => {
    if (node.type === 'rule' && node.selector && IMPORT_REGEXP.test(node.selector)) {
      imports.push(fetchImport(node, css.source.input.from, translations, options));
    }
  });
  return imports;
}

function fetchImport(node, relativeTo, translations, options) {
  let file = node.selector.match(IMPORT_REGEXP)[1].replace(/^['"]|['"]$/g, '');

  return Promise.resolve(options.fetchExports(file, relativeTo)).then((exports) => {
    node.each((decl) => {
      if (decl.type === 'decl') {
        if (decl.value in exports) {
          translations[decl.prop] = exports[decl.value];
        } else if (options.onImportResolutionFailure) {
          options.onImportResolutionFailure(decl.value, file, relativeTo);
        } else {
          translations[decl.prop] = undefined;
        }
      }
    });
    node.remove();
  }, (failure) => {
    options.onModuleResolutionFailure(failure, file, relativeTo);
  });
}

function extractExports(css, translations, exportTokens) {
  css.each((node) => {
    if (node.type === 'rule' && node.selector === ':export') {
      node.each((decl) => {
        Object.keys(translations).forEach((translation) => {
          decl.value = decl.value.replace(translation, translations[translation]);
        });
        exportTokens[decl.prop] = decl.value;
      });
      node.remove();
    }
  });
}
