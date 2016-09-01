/* global describe, it */
'use strict';

require('chai-as-promised');

var path = require('path');
var chai = require('chai');
var fixture = require('broccoli-fixture');
var CSSModules = require('./index');

var Node = fixture.Node;
var Builder = fixture.Builder;

chai.use(require('chai-as-promised'));

var assert = chai.assert;

describe('broccoli-css-modules', function() {
  it('processes simple input and produces ICSS and JS', function() {
    this.slow(250);

    var input = new Node({
      'foo.css': '.abc {}'
    });

    var compiled = fixture.build(new CSSModules(input));

    return assert.eventually.deepEqual(compiled, {
      'foo.css': cssOutput('foo.css', [
        '._foo__abc {}'
      ]),
      'foo.js': jsOutput({
        abc: '_foo__abc'
      })
    });
  });

  it('triggers the onProcessFile callback when specified', function() {
    var input = new Node({
      'foo.css': '.abc {}'
    });

    var calledWith = null;
    var modules = new CSSModules(input, {
      onProcessFile: function(file) {
        assert.equal(calledWith, null);
        calledWith = file;
      }
    });

    return fixture.build(modules).then(function() {
      assert.equal(calledWith, path.join(modules.inputPaths[0], 'foo.css'));
    });
  });

  it('accepts custom output formatters for JS and CSS', function() {
    var input = new Node({
      'foo.css': '.abc {}'
    });

    var compiled = fixture.build(new CSSModules(input, {
      formatJS: function(classMappings, modulePath) {
        assert.equal(modulePath, 'foo.css');
        assert.deepEqual(classMappings, { abc: '_foo__abc' });
        return 'js content';
      },

      formatCSS: function(namespacedCSS, modulePath) {
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
    var input = new Node({
      directory: {
        'file.css': '.class {}'
      }
    });

    var compiled = fixture.build(new CSSModules(input, {
      generateScopedName: function(className, path, rule) {
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
    var input = new Node({
      directoryA: {
        'entry.css': '@value test from "library";'
      },
      lib: {
        library: {
          'index.css': '@value test: blue;'
        }
      }
    });

    var compiled = fixture.build(new CSSModules(input, {
      resolvePath: function(relativePath, fromFile) {
        assert.equal(relativePath, 'library');
        assert.equal(fromFile, this.inputPaths[0] + '/directoryA/entry.css');
        return this.inputPaths[0] + '/lib/library/index.css';
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
    var special = { toString: function() { return this.prefix + '/bar.css'; } };
    var input = new Node({
      'foo.css': '.foo { composes: bar from "bar"; }',
      'bar.css': '.bar { }'
    });

    var generateCount = 0;
    var expectedDepValues = ['bar.css', 'foo.css', special];
    var compiled = fixture.build(new CSSModules(input, {
      resolvePath: function(relativePath, fromFile) {
        special.prefix = this.inputPaths[0];
        return special;
      },

      generateScopedName: function(className, path, rule, dependency) {
        var expectedDep = expectedDepValues[generateCount++];
        if (typeof expectedDep === 'string') {
          expectedDep = this.inputPaths[0] + '/' + expectedDep;
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

    var input = new Node({
      'entry.css': '.outer { .class { color: blue; } }'
    });

    var compiled = fixture.build(new CSSModules(input, {
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
    var input = new Node({
      'entry.foo.bar': '.class { color: green; }'
    });

    var compiled = fixture.build(new CSSModules(input, {
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
    var input = new Node({
      'entry.css': '.class {}',
      'other.txt': 'hello'
    });

    var compiled = fixture.build(new CSSModules(input));

    return assert.eventually.deepEqual(compiled, {
      'entry.css': cssOutput('entry.css', [
        '._entry__class {}'
      ]),
      'entry.js': jsOutput({
        class: '_entry__class'
      }),
      'other.txt': 'hello'
    });
  });

  it('applies an array of additional PostCSS plugins after the modules transform', function() {
    var input = new Node({
      'entry.css': '.class { color: green; }'
    });

    var compiled = fixture.build(new CSSModules(input, {
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
    var input = new Node({
      'constants.css': '@value superbold: 800;',
      'entry.css': '@value superbold from "constants.css";\n.class { color: green; font-weight: superbold; }'
    });

    var compiled = fixture.build(new CSSModules(input, {
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

  // The tests below are essentially just verifying the loader functionality, but useful as a sanity check

  it('composes classes across modules', function() {
    var input = new Node({
      'base.css': '.green { color: green; }',
      components: {
        'my-component.css': '.comp { composes: green from "../base.css"; }'
      }
    });

    var compiled = fixture.build(new CSSModules(input));

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
    var input = new Node({
      'constants.css': '@value foo: "Helvetica Neue", Geneva, Arial, sans-serif;',
      'styles.css': '@value foo from "./constants.css";\n.class { font-family: foo; }'
    });

    var compiled = fixture.build(new CSSModules(input));

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
