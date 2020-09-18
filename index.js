#!/usr/bin/env node

'use strict';

const fs = require('fs');
const util = require('util');
const blessed = require('blessed');
const contrib = require('blessed-contrib');
const _ = require('lodash');

const ROS = require('./ros.js');
const Queue = require('./queue.js');
const utils = require('./utils.js');

const logFile = fs.createWriteStream('/tmp/ros-blessed.log');
const log = (...args) => {
  const textArgs = args.map(arg => (typeof arg == 'object' ?
    util.inspect(arg) : arg));
  logFile.write(textArgs.join(' ') + '\n');
};

// Create a screen object.
const screen = blessed.screen({
  smartCSR: true
});

screen.title = 'ROS Blessed';

// Quit on Escape, q, or Control-C.
screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  return process.exit(0);
});


// --------------------------------------------

const body = blessed.box({
  top: 1,
  scrollable: true,
  scrollbar: true,
});

const setScreen = (content) => {
  body.children && body.children.forEach(x => x.destroy());

  if (content instanceof blessed.node) {
    body.append(content);
  } else if (typeof content == 'object') {
    body.append(blessed.text({content: util.inspect(content)}));
  } else {
    body.append(blessed.text({content}));
  }
  screen.render();
};


class Vertical {
  constructor() {
    this.box = blessed.box({});
    this.on = this.box.on.bind(this.box);
    this.box.on('prerender', this.readjust.bind(this));
  }

  get() {
    return this.box;
  }

// class Vertical extends blessed.box {

  append(node) {
    this.box.append(node);
    node.position.height = 1; // needed to avoid error when getting node.height
  }

  readjust() {
    let height = 0;
    this.box.children.forEach(child => {
      child.top = height;
      height += child.height;
    });
  }
};


const screens = {
  topics: async () => {
    const data = await ros.getTopics();
    const list = blessed.list({
      items: _.map(data.topics, 'name').sort(),
      keys: true,
      style: {
        selected: {
          fg: 'green'
        }
      },
    });
    setScreen(list);
    list.focus();
    list.on('select', x => screens.topic(x.content));
    // list.on('keypress', log); // to get key names
    list.key(['pagedown'], function(ch, key) {
      list.down(screen.height);
      screen.render();
    });
    list.key(['pageup'], function(ch, key) {
      list.up(screen.height);
      screen.render();
    });
  },


  topic: (topicName) => {
    log(topicName);
    // setScreen(topicName);

    // const box = blessed.box({});
    const box = new Vertical();
    const info = blessed.text({
      style: {
        fg: '#aaaa00'
      },
      width: '100%'
    });
    const list = blessed.list({
      // top: 1,
      keys: true,
      style: {
        selected: {
          fg: 'green'
        }
      },
    });
    list.on('select', x => log(Object.keys(x), x.index, x.position));

    const publishers = blessed.list({
      // top: 3, // will be adjusted on the fly
      items: ['Publishers: ...'],
      keys: true,
      style: {
        selected: {
          fg: 'red'
        }
      },
    });
    publishers.on('select', x => log(Object.keys(x), x.index, x.position));

    const subscribers = blessed.list({
      // top: 5, // will be adjusted on the fly
      items: ['Subscribers: ...'],
      keys: true,
      style: {
        selected: {
          fg: 'cyan'
        },
      },
    });
    subscribers.on('select', x => log(Object.keys(x), x.index, x.position));

    box.append(info);
    box.append(publishers);
    box.append(subscribers);
    box.append(list);
    setScreen(box.get());

    const stats = {
      times: new Queue(50),
      sizes: new Queue(50)
    };
    let type;

    const lineSelectors = [];

    ros.subscribe(topicName, (data, _type, size, nodeUri) => {
      type = _type;
      // log(nodeUri);
      // text.setContent(util.inspect(data));
      // const pretty = util.inspect(data);
      // list.setItems(pretty.split('\n'));

      const items = _.mapValues(data, v =>
        util.inspect(v, {depth: 1}).split('\n'));

      lineSelectors.length = 0; // clear list
      const flat = [];
      _.each(items, (item, key) => {
        item.forEach((line, i) => {
          lineSelectors.push({line, key});
          if (i == 0) {
            // first line in group: add key
            line = `${key}: ${line}`;
          }
          flat.push(line);
        });
      });
      list.height = flat.length;
      list.setItems(flat);

      const now = Date.now();
      stats.times.add(now);
      stats.sizes.add(size);
      screen.render();
      list.focus();
    });

    const updateInfo = () => {
      const timeDiff = (Date.now() - stats.times[0]) / 1e3;
      const hz = stats.times.length > 1 ? stats.times.length/timeDiff : 0;
      const sum = stats.sizes.reduce((sum, size) => sum += size, 0);
      const bw = stats.sizes.length > 0 && (sum / timeDiff) / 1e3;
      info.setContent([
          `Topic: ${topicName}`,
          `Type: ${type}`,
          `${hz.toLocaleString()} Hz`,
          `${bw.toLocaleString()} KB/s`
        ].join('  '));

      ros.getSystemState().then(state => {
        const pubList = state.publishers[topicName] || [];
        pubList.unshift('Publishers:');
        publishers.setItems(pubList);
        publishers.height = pubList.length;

        const subList = state.subscribers[topicName] || [];
        subList.unshift('Subscribers:');
        subscribers.setItems(subList);
        subscribers.height = subList.length;

        screen.render();
      });

      screen.render();
    };
    updateInfo();
    const interval = setInterval(updateInfo, 1000);

    box.on('destroy', () => {
      ros.unsubscribe(topicName);
      clearInterval(interval);
    });
  },


  services: async () => {
    const state = ros.getState();
    log(state);
    const list = blessed.list({
      items: Object.keys(state.services).sort(),
      keys: true,
      style: {
        selected: {
          fg: 'blue'
        }
      },
    });
    setScreen(list);
    list.focus();
    list.on('select', x => screens.service(x.content));
  },

  service: async (serviceName) => {
    const data = await ros.getService(serviceName);
    log(data);
  },


  tfTree: () => {
    const tree = contrib.tree({
      extended: true,
      template: {lines: true}
    });
    tree.focus()

    tree.on('select',function(node){
      if (node.custom){
        log(node.custom);
      }
    });

    setScreen(tree);
    const update = () => {
      const decorated = JSON.parse(JSON.stringify(ros.getTFForest()));
      decorateTFTree(decorated);
      tree.setData({
        extended: true,
        children: decorated
      });
      screen.render();
    };

    update();
    const interval = setInterval(update, 2000);
  }
};


const decorateTFTree = (tree) => {
  _.each(tree, node => {
    const nodeName = node.custom && ros.getNodeName(node.custom.nodeUri);
    node.name = `${node.name}${nodeName ? ` [${nodeName}]` : ''}`;
    decorateTFTree(node.children);
  });
};


const menu = blessed.listbar({
  items: {
    topics: {
      keys: ['1'],
      callback: screens.topics
    },
    services: screens.services,
    TF: screens.tfTree
  },
  autoCommandKeys: true,
  style: {
    selected: {
      fg: '#00ff00',
      bg: '#202020'
    },
    item: {
      bg: '#202020'
    },
    bg: '#202020'
  }
});

// Append our box to the screen.
screen.append(menu);
screen.append(body);

// ---------------------------------------
// MAIN
setScreen('Select a tab (using number keys) to get started.');

// Focus our element.
menu.focus();

// Render the screen.
console.log('connecting to ROS master');
const ros = new ROS(() => {
    screen.render();
  }, [fs.createWriteStream('/tmp/ros-blessed.ros.log')]);
