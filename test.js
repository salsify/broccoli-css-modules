/* global describe, it */
'use strict';

require('chai-as-promised');

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

  it('applies additional PostCSS plugins', function() {
    var input = new Node({
      'entry.css': '.class { color: green; }'
    });

    var compiled = fixture.build(new CSSModules(input, {
      plugins: [
        function(css) {
          css.walkRules(function(rule) {
            rule.walkDecls(function(decl) {
              if (decl.prop === 'color') {
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
      'constants.css': '@value foo: green',
      'styles.css': '@value foo from "./constants.css";\n.class { color: foo; }'
    });

    var compiled = fixture.build(new CSSModules(input));

    return assert.eventually.deepEqual(compiled, {
      'constants.css': cssOutput('constants.css', []),
      'constants.js': jsOutput({
        foo: 'green'
      }),
      'styles.css': cssOutput('styles.css', [
        '._styles__class { color: green; }'
      ]),
      'styles.js': jsOutput({
        foo: 'green',
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
