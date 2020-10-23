'use strict';

const blessed = require('blessed');
const EventEmitter = require('events');

const { log } = require('./utils.js');

/** A better tree component for blessed */
class Tree extends EventEmitter {

  constructor(structure, options = {}) {
    super();
    // this.lines = this.createTree(structure, options).split('\n');
    this.lines = this.createTree(structure, options);
    const mergedStyle = Object.assign({
        keys: true,
        style: {
          selected: {
            bg: 'blue'
          }
        },
      }, options.style);
    this.list = blessed.list(mergedStyle);
    this.list.on('select', x => this.emit('select', this.lines[x.position.top]));
    this.list.on('destroy', x => this.emit('destroy'));
    this.options = options;
  }

  /** returns a blessed screen element */
  render() {
    this.list.setItems(this.lines.map(l => `${l._prefix}${l._label}`));
    this.list.focus();
    return this.list;
  }

  update(structure) {
    this.lines = this.createTree(structure, this.options);
    this.render();
  }

  // Modified from https://github.com/A1rPun/formatree/blob/master/index.js
  createTree(structure = {}, options = {}) {
    const newLine = '\n';
    const values = options.values;
    const sibling = options.sibling || '├── ';
    const lastSibling = options.lastSibling || '└── ';
    const indent = options.indent || '│   ';
    const lastIndent = options.lastIndent || '    ';

    /** generate structures like this:
    [
      { _prefix: '├── ', label: 'a', other: 1 },
      { _prefix: '├── ', label: 'b' },
      { _prefix: '│   ├── ', label: 'b1', something: 1 },
      { _prefix: '│   ├── ', label: 'b2' },
      { _prefix: '│   │   └── ', label: 'b21', someother: 1 },
      { _prefix: '│   └── ', label: 'b3', value: 3 },
      { _prefix: '└── ', label: 'c', value: 3 }
    ]
    */
    const formatree = (list, prepend) => {
      let result = [];
      const lastIndex = list.length - 1;
      list.forEach( (val, i) => {
        const line = val;
        result.push(line);
        line._prefix = prepend + (i === lastIndex ? lastSibling : sibling)
        if (options.renderer) {
          line._label = options.renderer(val);
        } else {
          line._label = val.name;
        }

        if (val.children) {
          result = result.concat(
            formatree(Object.values(val.children),
              prepend + (i === lastIndex ? lastIndent : indent)));
        }
      });
      return result;
    }

    return formatree(Object.values(structure), '');
  };

}


class List extends EventEmitter {

  constructor(items, screen) {
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
