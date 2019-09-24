/* global describe, it */
'use strict';

require('chai-as-promised');

const sinon = require('sinon');
const chai = require('chai');
const fixture = require('broccoli-fixture');
const postcss = require('postcss');
const CSSModules = require('./index');

const Node = fixture.Node;

chai.use(require('chai-as-promised'));

const assert = chai.assert;

describe('broccoli-css-modules', function() {
  it('processes simple input and produces modularized CSS and JS', function() {
    this.slow(250);

    let input = new Node({
      'foo.css': '.abc {}'
    });

    let compiled = fixture.build(new CSSModules(input));

    return assert.eventually.deepEqual(compiled, {
      'foo.css': cssOutput('foo.css', [
        '._foo__abc {}'
      ]),
      'foo.js': jsOutput({
        abc: '_foo__abc'
      })
    });
  });

  it('accepts a set of seed modules', function() {
    let input = new Node({
      'foo.css': '@value --test-color from "seeds";\n.abc { color: --test-color; }'
    });

    let compiled = fixture.build(new CSSModules(input, {
      virtualModules: {
        seeds: {
          '--test-color': 'orange'
        }
      }
    }));

    return assert.eventually.deepEqual(compiled, {
      'foo.css': cssOutput('foo.css', [
        '._foo__abc { color: orange; }'
      ]),
      'foo.js': jsOutput({
        '--test-color': 'orange',
        abc: '_foo__abc'
      })
    });
  });

  it('triggers the onProcessFile callback when specified', function() {
    let input = new Node({
      'foo.css': '.abc {}'
    });

    let calledWith = null;
    let modules = new CSSModules(input, {
      onProcessFile(file) {
        assert.equal(calledWith, null);
        calledWith = file;
      }
    });

    return fixture.build(modules).then(function() {
      assert.equal(calledWith, modules.posixInputPath() + '/foo.css');
    });
  });

  it('triggers successful build lifecycle hooks when specified', function() {
    let input = new Node({
      'foo.css': '.abc {}'
    });

    let onBuildStart = sinon.spy();
    let onBuildEnd = sinon.spy();
    let onBuildSuccess = sinon.spy();
    let onBuildError = sinon.spy();

    let onProcessFile = () => {
      assert.equal(onBuildStart.callCount, 1);
      assert.equal(onBuildEnd.callCount, 0);
      assert.equal(onBuildSuccess.callCount, 0);
      assert.equal(onBuildError.callCount, 0);
    };

    let modules = new CSSModules(input, { onBuildStart, onBuildEnd, onBuildSuccess, onBuildError, onProcessFile });

    return fixture.build(modules)
      .then(() => {
        assert.equal(onBuildStart.callCount, 1);
        assert.equal(onBuildEnd.callCount, 1);
        assert.equal(onBuildSuccess.callCount, 1);
        assert.equal(onBuildError.callCount, 0);
      });
  });

  it('triggers failure build lifecycle hooks when specified', function() {
    let input = new Node({
      'foo.css': '.abc {'
    });

    let onBuildStart = sinon.spy();
    let onBuildEnd = sinon.spy();
    let onBuildSuccess = sinon.spy();
    let onBuildError = sinon.spy();

    let onProcessFile = () => {
      assert.equal(onBuildStart.callCount, 1);
      assert.equal(onBuildEnd.callCount, 0);
      assert.equal(onBuildSuccess.callCount, 0);
      assert.equal(onBuildError.callCount, 0);
    };

    let modules = new CSSModules(input, { onBuildStart, onBuildEnd, onBuildSuccess, onBuildError, onProcessFile });

    return fixture.build(modules)
      .then(
        () => assert.fail('Build should have errored'),
        () => {
          assert.equal(onBuildStart.callCount, 1);
          assert.equal(onBuildEnd.callCount, 1);
          assert.equal(onBuildSuccess.callCount, 0);
          assert.equal(onBuildError.callCount, 1);
        }
      );
  });

  it('invokes onModuleResolutionFailure when specified', function() {
    let input = new Node({
      'foo.css': '.abc { composes: def from "nonexistent"; }'
    });

    let called = false;
    let modules = new CSSModules(input, {
      onModuleResolutionFailure(failure, path, relativeTo) {
        called = true;
        assert.ok(/ENOENT/.test(failure.message));
        assert.equal(path, 'nonexistent');
        assert.ok(/foo\.css$/.test(relativeTo));
      }
    });

    return fixture.build(modules).then(function() {
      assert.ok(called);
    });
  });

  it('fails when a module cannot be found and no onModuleResolutionFailure is specified', function() {
    let input = new Node({
      'foo.css': '.abc { composes: def from "nonexistent"; }'
    });

    let modules = new CSSModules(input);

    return assert.isRejected(fixture.build(modules), /ENOENT/);
  });

  it('invokes onImportResolutionFailure when specified', function() {
    let input = new Node({
      'foo.css': '.abc { composes: def from "bar.css"; }',
      'bar.css': '.foo {}'
    });

    let called = false;
    let modules = new CSSModules(input, {
      onImportResolutionFailure(symbol, path, relativeTo) {
        called = true;
        assert.equal(symbol, 'def');
        assert.equal(path, 'bar.css');
        assert.ok(/foo\.css$/.test(relativeTo));
      }
    });

    return fixture.build(modules).then(function() {
      assert.ok(called);
    });
  });

  it('silently ignores import resolution failures when no onImportResolutionFailure is specified', function() {
    let input = new Node({
      'foo.css': '.abc { composes: def from "bar.css"; }',
      'bar.css': '.foo {}'
    });

    let modules = new CSSModules(input);

    return assert.eventually.deepEqual(fixture.build(modules), {
      'foo.css': cssOutput('foo.css', [
        '._foo__abc { }'
      ]),
      'foo.js': jsOutput({
        abc: '_foo__abc undefined'
      }),
      'bar.css': cssOutput('bar.css', [
        '._bar__foo {}'
      ]),
      'bar.js': jsOutput({
        foo: '_bar__foo'
      })
    });
  });

  it('accepts custom output formatters for JS and CSS', function() {
    let input = new Node({
      'foo.css': '.abc {}'
    });

    let compiled = fixture.build(new CSSModules(input, {
      formatJS(classMappings, modulePath) {
        assert.equal(modulePath, 'foo.css');
        assert.deepEqual(classMappings, { abc: '_foo__abc' });
        return 'js content';
      },

      formatCSS(namespacedCSS, modulePath) {
        assert.equal(modulePath, 'foo.css');
        assert.equal(namespacedCSS, '._foo__abc {}');
        return 'css content';
      }
    }));

    return assert.eventually.deepEqual(compiled, {
      'foo.css': 'css content',
      'foo.js': 'js content'
    });
  });

  it('allows for customizing scoped name generation', function() {
    let input = new Node({
      directory: {
        'file.css': '.class {}'
      }
    });

    let compiled = fixture.build(new CSSModules(input, {
      generateScopedName(className, path, rule) {
        assert.equal(className, 'class');
        assert.equal(path, 'directory/file.css');
        assert.equal(rule, '.class {}');
        return 'custom-name';
      }
    }));

    return assert.eventually.deepEqual(compiled, {
      directory: {
        'file.css': cssOutput('directory/file.css', ['.custom-name {}']),
        'file.js': jsOutput({ class: 'custom-name' })
      }
    });
  });

  it('allows for customizing import resolution', function() {
    let input = new Node({
      directoryA: {
        'entry.css': '@value test from "library";'
      },
      lib: {
        library: {
          'index.css': '@value test: blue;'
        }
      }
    });

    let compiled = fixture.build(new CSSModules(input, {
      resolvePath(relativePath, fromFile) {
        assert.equal(relativePath, 'library');
        assert.equal(fromFile, this.posixInputPath() + '/directoryA/entry.css');
        return this.posixInputPath() + '/lib/library/index.css';
      }
    }));

    return assert.eventually.deepEqual(compiled, {
      directoryA: {
        'entry.css': cssOutput('directoryA/entry.css', []),
        'entry.js': jsOutput({ test: 'blue' })
      },
      lib: {
        library: {
          'index.css': cssOutput('lib/library/index.css', []),
          'index.js': jsOutput({ test: 'blue' })
        }
      }
    });
  });

  it('passes exact values returned from import resolution to scoped name generation', function() {
    let special = { toString() { return this.prefix + '/bar.css'; } };
    let input = new Node({
      'foo.css': '.foo { composes: bar from "bar"; }',
      'bar.css': '.bar { }'
    });

    let generateCount = 0;
    let expectedDepValues = ['bar.css', 'foo.css', special];
    let compiled = fixture.build(new CSSModules(input, {
      resolvePath() {
        special.prefix = this.posixInputPath();
        return special;
      },

      generateScopedName(className, path, rule, dependency) {
        let expectedDep = expectedDepValues[generateCount++];
        if (typeof expectedDep === 'string') {
          expectedDep = this.posixInputPath() + '/' + expectedDep;
        }

        assert.equal(dependency, expectedDep);
        return '_' + path.replace('.css', '') + '__' + className;
      }
    }));

    return assert.eventually.deepEqual(compiled, {
      'foo.css': cssOutput('foo.css', [
        '._foo__foo { }'
      ]),
      'bar.css': cssOutput('bar.css', [
        '._bar__bar { }'
      ]),
      'foo.js': jsOutput({
        foo: '_foo__foo _bar__bar'
      }),
      'bar.js': jsOutput({
        bar: '_bar__bar'
      })
    });
  });

  it('passes custom PostCSS options', function() {
    this.slow(150);

    let input = new Node({
      'entry.css': '.outer { .class { color: blue; } }'
    });

    let compiled = fixture.build(new CSSModules(input, {
      postcssOptions: {
        syntax: require('postcss-scss')
      }
    }));

    return assert.eventually.deepEqual(compiled, {
      'entry.css': cssOutput('entry.css', [
        '._entry__outer { ._entry__class { color: blue; } }'
      ]),
      'entry.js': jsOutput({
        outer: '_entry__outer',
        class: '_entry__class'
      })
    });
  });

  it('accepts a custom extension', function() {
    let input = new Node({
      'entry.foo.bar': '.class { color: green; }'
    });

    let compiled = fixture.build(new CSSModules(input, {
      extension: 'foo.bar'
    }));

    return assert.eventually.deepEqual(compiled, {
      'entry.foo.bar': cssOutput('entry.foo.bar', [
        '._entry_foo__class { color: green; }'
      ]),
      'entry.js': jsOutput({
        class: '_entry_foo__class'
      })
    });
  });

  it('ignores irrelevant files', function() {
    let input = new Node({
      'entry.css': '.class {}',
      'base': 'extensionless',
      'other': {
        'fileA.txt': 'hello',
        'fileB.txt': 'goodbye'
      }
    });

    let compiled = fixture.build(new CSSModules(input));

    return assert.eventually.deepEqual(compiled, {
      'entry.css': cssOutput('entry.css', [
        '._entry__class {}'
      ]),
      'entry.js': jsOutput({
        class: '_entry__class'
      }),
      'base': 'extensionless',
      'other': {
        'fileA.txt': 'hello',
        'fileB.txt': 'goodbye'
      }
    });
  });

  it('applies an array of additional PostCSS plugins after the modules transform', function() {
    let input = new Node({
      'entry.css': '.class { color: green; }'
    });

    let compiled = fixture.build(new CSSModules(input, {
      plugins: [
        function(css) {
          css.walkRules(function(rule) {
            rule.walkDecls(function(decl) {
              if (decl.prop === 'color') {
                assert.equal(decl.parent.selector, '._entry__class');
                decl.value = 'blue';
              }
            });
          });

          return css;
        }
      ]
    }));

    return assert.eventually.deepEqual(compiled, {
      'entry.css': cssOutput('entry.css', [
        '._entry__class { color: blue; }'
      ]),
      'entry.js': jsOutput({
        class: '_entry__class'
      })
    });
  });

  it('applies explicit before and after PostCSS plugin sets around the modules transform', function() {
    let input = new Node({
      'constants.css': '@value superbold: 800;',
      'entry.css': '@value superbold from "constants.css";\n.class { color: green; font-weight: superbold; }'
    });

    let compiled = fixture.build(new CSSModules(input, {
      plugins: {
        before: [
          function(css) {
            css.walkRules(function(rule) {
              rule.walkDecls(function(decl) {
                if (decl.prop === 'color') {
                  assert.equal(decl.value, 'green');
                  assert.equal(decl.parent.selector, '.class');
                  decl.value = 'blue';
                } else if (decl.prop === 'font-weight') {
                  assert.equal(decl.value, 'superbold');
                  assert.equal(decl.parent.selector, '.class');
                }
              });
            });

            return css;
          }
        ],
        after: [
          function(css) {
            css.walkRules(function(rule) {
              rule.walkDecls(function(decl) {
                if (decl.prop === 'color') {
                  assert.equal(decl.value, 'blue');
                  assert.equal(decl.parent.selector, '._entry__class');
                  decl.value = 'red';
                } else if (decl.prop === 'font-weight') {
                  assert.equal(decl.value, '800');
                  assert.equal(decl.parent.selector, '._entry__class');
                }
              });
            });

            return css;
          }
        ]
      }
    }));

    return assert.eventually.deepEqual(compiled, {
      'constants.css': cssOutput('constants.css', []),
      'constants.js': jsOutput({
        superbold: '800'
      }),
      'entry.css': cssOutput('entry.css', [
        '._entry__class { color: red; font-weight: 800; }'
      ]),
      'entry.js': jsOutput({
        superbold: '800',
        class: '_entry__class'
      })
    });
  });

  it('provides `relativeFrom` to PostCSS plugins', function() {
    let input = new Node({
      'dependency.css': '@value file-name: FILE_NAME;',
      'entry.css': '@value file-name: FILE_NAME;\n@value file-name as dependency-file-name from "dependency.css";\n.class { file-name: file-name; dependency-file-name: dependency-file-name; }'
    });

    let compiled = fixture.build(new CSSModules(input, {
      plugins: {
        before: [
          function(css, result) {
            css.walkAtRules('value', function(rule) {
              rule.params = rule.params.replace(/FILE_NAME/g, result.opts.relativeFrom);
            });

            return css;
          }
        ],
        after: [
          function(css, result) {
            css.append(postcss.comment({
              text: result.opts.relativeFrom,
              raws: { before: '\n' }
            }));

            return css;
          }
        ]
      }
    }));

    return assert.eventually.deepEqual(compiled, {
      'dependency.css': cssOutput('dependency.css', [
        '',
        '/* dependency.css */'
      ]),
      'dependency.js': jsOutput({
        'file-name': 'dependency.css'
      }),
      'entry.css': cssOutput('entry.css', [
        '._entry__class { file-name: entry.css; dependency-file-name: dependency.css; }',
        '/* entry.css */'
      ]),
      'entry.js': jsOutput({
        'file-name': 'entry.css',
        'dependency-file-name': 'dependency.css',
        class: '_entry__class'
      })
    });
  });

it('produces sourcemaps when enabled', function() {
  let input = new Node({
    'base.css': '.green {}'
  });

  let compiled = fixture.build(new CSSModules(input, { enableSourceMaps: true }));

  return assert.eventually.deepEqual(compiled, {
      'base.css': mappedCSSOutput(['._base__green {}'], {
        version: 3,
        sources: ['base.css'],
        names: [],
        mappings: 'AAAA,gBAAS',
        file: 'base.css',
        sourcesContent: ['.green {}']
      }),
      'base.js': jsOutput({
        green: '_base__green'
      })
  });
});

it('honors the sourceMapBaseDir when configured', function() {
  let input = new Node({
    foo: {
      bar: {
        baz: {
          'base.css': '.green {}'
        }
      }
    }
  });

  let compiled = fixture.build(new CSSModules(input, {
    enableSourceMaps: true,
    sourceMapBaseDir: 'foo/bar'
  }));

  return assert.eventually.deepEqual(compiled, {
    foo: {
      bar: {
        baz: {
          'base.css': mappedCSSOutput(['._foo_bar_baz_base__green {}'], {
            version: 3,
            sources: ['baz/base.css'],
            names: [],
            mappings: 'AAAA,4BAAS',
            file: 'baz/base.css',
            sourcesContent: ['.green {}']
          }),
          'base.js': jsOutput({
            green: '_foo_bar_baz_base__green'
          })
        }
      }
    }
  });
});

it('allows the JS output path to be customized', function() {
  let input = new Node({
    dir: {
      'file.css': '.green { color: green; }'
    },
  });

  let compiled = fixture.build(new CSSModules(input, {
    getJSFilePath(cssPath) {
      return cssPath.replace(/\.css$/, '-module.css.js');
    },
  }));

  return assert.eventually.deepEqual(compiled, {
    dir: {
      'file.css': cssOutput('dir/file.css', [
        '._dir_file__green { color: green; }',
      ]),
      'file-module.css.js': jsOutput({
        green: '_dir_file__green',
      }),
    },
  });
});

  // The tests below are essentially just verifying the loader functionality, but useful as a sanity check

  it('composes classes across modules', function() {
    let input = new Node({
      'base.css': '.green { color: green; }',
      components: {
        'my-component.css': '.comp { composes: green from "../base.css"; }'
      }
    });

    let compiled = fixture.build(new CSSModules(input));

    return assert.eventually.deepEqual(compiled, {
      'base.css': cssOutput('base.css', [
        '._base__green { color: green; }'
      ]),
      'base.js': jsOutput({
        green: '_base__green'
      }),

      components: {
        'my-component.css': cssOutput('components/my-component.css', [
          '._components_my_component__comp { }'
        ]),
        'my-component.js': jsOutput({
          comp: '_components_my_component__comp _base__green'
        })
      }
    });
  });

  it('exposes custom values in both JS and CSS', function() {
    let input = new Node({
      'constants.css': '@value foo: "Helvetica Neue", Geneva, Arial, sans-serif;',
      'styles.css': '@value foo from "./constants.css";\n.class { font-family: foo; }'
    });

    let compiled = fixture.build(new CSSModules(input));

    return assert.eventually.deepEqual(compiled, {
      'constants.css': cssOutput('constants.css', []),
      'constants.js': jsOutput({
        foo: '"Helvetica Neue", Geneva, Arial, sans-serif'
      }),
      'styles.css': cssOutput('styles.css', [
        '._styles__class { font-family: "Helvetica Neue", Geneva, Arial, sans-serif; }'
      ]),
      'styles.js': jsOutput({
        foo: '"Helvetica Neue", Geneva, Arial, sans-serif',
        class: '_styles__class'
      })
    });
  });
});

function cssOutput(file, lines) {
  return '/* styles for ' + file + ' */\n' + lines.join('\n');
}

function jsOutput(data) {
  return 'export default ' + JSON.stringify(data, null, 2) + ';';
}

function mappedCSSOutput(lines, sourcemap) {
  return lines.join('\n') + '\n' + sourceMapComment(sourcemap);
}

function sourceMapComment(json) {
  let content = new Buffer(JSON.stringify(json), 'utf-8').toString('base64');
  return '/*# sourceMappingURL=data:application/json;base64,' + content + ' */';
}
