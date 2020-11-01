'use strict';

const blessed = require('blessed');
const EventEmitter = require('events');

const { log } = require('./utils.js');

/** A better tree component for blessed */
class Tree extends EventEmitter {

  constructor(structure, screen, options = {}) {
    super();
    this.structure = structure;
    this.screen = screen;

    // this.lines = this.createTree(structure, options).split('\n');
    this.lines = this.createTree(structure, options);
    const mergedStyle = Object.assign({
        keys: true,
        style: {
          selected: {
            bg: 'blue'
          }
        },
        tags: true
      }, options.style);
    this.list = blessed.list(mergedStyle);
    this.list.on('select', x => this.emit('select', this.lines[x.position.top]));
    this.list.on('destroy', x => this.emit('destroy'));

    this.list.key(['pagedown'], (ch, key) => {
      this.list.down(screen.height);
      screen.render();
    });
    this.list.key(['pageup'], (ch, key) => {
      this.list.up(screen.height);
      screen.render();
    });
    this.search = '';

    this.list.on('keypress', (ch, key) => {
      if (key.name == 'return' || key.name == 'space' || key.name == 'enter') {
        return;
      }
      if (key.name == 'left' || key.name == 'right'  || key.ch == '+'
        || key.ch == '-') {
        const path = this.lines[this.list.selected]._path;
        this.toggle(path.slice(1), this.structure[path[0]]);
        return;
      }

      if (key.name == 'backspace') {
        this.search = this.search.slice(0, -1);
      } else if (ch) {
        this.search += ch;
      }
      if (this.search.length > 0) {
        const index = this.lines.findIndex(x => x._label.includes(this.search));
        log(this.search, index, key);
        this.list.select(index);
        screen.render();
      }
    });

    this.options = options;
  }

  /** returns a blessed screen element */
  render() {
    this.list.setItems(this.lines.map(l =>
      `{#777777-fg}${l._prefix}{/#777777-fg}${l._label}${l._collapsed ? ' [+]' : ''}`));
    this.list.focus();
    return this.list;
  }

  update(structure) {
    this.structure = structure;
    this.lines = this.createTree(structure, this.options);
    this.render();
    this.screen.render();
  }

  /** collapse/expand sub-tree at path */
  toggle(path, subtree) {
    log('toggle', path);
    if (path.length == 0) {
      if (!subtree.children || Object.keys(subtree.children).length == 0) {
        return; // no children to collapse
      }
      subtree._collapsed = !subtree._collapsed;
      log('collapse', subtree);
      this.lines = this.createTree(this.structure, this.options);
      this.render();
      this.screen.render();
    } else {
      this.toggle(path.slice(1), subtree.children[path[0]]);
    }
  }

  // Modified from https://github.com/A1rPun/formatree/blob/master/index.js
  createTree(structure = {}, options = {}) {
    const newLine = '\n';
    const sibling = options.sibling || '├── ';
    const lastSibling = options.lastSibling || '└── ';
    const indent = options.indent || '│   ';
    const lastIndent = options.lastIndent || '    ';

    /** generate structures like this:
    [
      { _prefix: '├── ', _label: 'b', _path: ['b'] },
      { _prefix: '│   ├── ', _label: 'b1', _path: ['b', 'b1'], something: 1 },
      { _prefix: '│   ├── ', _label: 'b2' ...  },
      { _prefix: '│   │   └── ', _label: 'b21', .. someother: 1 },
      { _prefix: '│   └── ', _label: 'b3', .. value: 3 },
      { _prefix: '└── ', _label: 'c', .. value: 3 }
    ]
    */
    const formatree = (list, prepend, path) => {
      let result = [];
      const lastIndex = list.length - 1;
      list.forEach( (val, i) => {
        const line = val;
        result.push(line);
        line._prefix = prepend + (i === lastIndex ? lastSibling : sibling)
        line._path = path.concat([val.name]);
        if (options.renderer) {
          line._label = options.renderer(val);
        } else {
          line._label = val.name;
        }

        if (val.children && !val._collapsed) {
          result = result.concat(
            formatree(
              Object.values(val.children),
              prepend + (i === lastIndex ? lastIndent : indent),
              line._path
            )
          );
        }
      });
      return result;
    }

    return formatree(Object.values(structure), '', []);
  };

}


class List extends EventEmitter {

  constructor(items, screen, bottomText) {
    super();
    const list = blessed.list({
      items,
      keys: true,
      style: {
        selected: {
          fg: 'green'
        }
      },
    });

    list.on('select', x => this.emit('select', x.content));
    list.key(['pagedown'], function(ch, key) {
      list.down(screen.height);
      screen.render();
    });
    list.key(['pageup'], function(ch, key) {
      list.up(screen.height, this);
      screen.render();
    });

    list.on('keypress', (ch, key) => {
      if (ch) {
        this.search += ch;
        const index = items.findIndex(x => x.includes(this.search));
        log(this.search, index);
        list.select(index);
        screen.render();
      }
    });

    this.list = list;
    this.search = '';
  }

  render() {
    this.list.focus();
    return this.list;
  }
}


module.exports = { Tree, List };
