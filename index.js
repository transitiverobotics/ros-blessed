#!/usr/bin/env node

'use strict';

const fs = require('fs');
const util = require('util');
const blessed = require('blessed');
const _ = require('lodash');

const ROS = require('./ros.js');
const Queue = require('./queue.js');
const { log } = require('./utils.js');
const { Tree, List } = require('./components.js');

// Create a screen object.
const screen = blessed.screen({
  smartCSR: true
});

screen.title = 'ROS Blessed';

const bottomText = blessed.text({
  bottom: 0,
  content: 'info here',
  style: {
    bg: '#0000a0',
  },
  hidden: true // unhide on demand
});

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

  let rtv;
  if (content instanceof blessed.node) {
    body.append(content);
    rtv = content;
  } else if (typeof content == 'object') {
    rtv = blessed.text({content: util.inspect(content)});
    body.append(rtv);
  } else {
    rtv = blessed.text({content});
    body.append(rtv);
  }
  screen.render();
  return rtv;
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

    // turn list into file-tree like structure, splitting on '/'
    const sortedList = _.map(data.topics, 'name').sort();
    const obj = {};

    const addToObject = (parts, obj) => {
      if (parts.length > 0) {
        const name = parts.shift();
        if (!obj[name]) {
          obj[name] = {name, children: {}};
        }
        if (parts.length > 0) {
          // not a leaf yet
          addToObject(parts, obj[name].children);
        } else {
          // it's a leaf, i.e., a topic
          obj[name].topic = true;
        }
      }
    };

    sortedList.forEach(topic => {
      const parts = topic.split('/');
      addToObject(parts.slice(1), obj);
    });


    const tree = new Tree(obj, screen, {
      renderer: ({name, topic}) => {
        const fontColor = (topic ? 'white' : '#777777');
        return `{bold}{${fontColor}-fg}${name}{/${fontColor}-fg}{/bold}`
      }
    });
    // list.on('select', x => screens.topic(x));
    tree.on('select', x => x.topic && screens.topic('/' + x._path.join('/')));
    setScreen(tree.render());
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
        util.inspect(v, {depth: 4}).split('\n'));

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
    // log(state);
    // const list = blessed.list({
    //   items: Object.keys(state.services).sort(),
    //   keys: true,
    //   style: {
    //     selected: {
    //       fg: 'blue'
    //     }
    //   },
    // });
    // setScreen(list);
    // list.focus();
    // list.on('select', x => screens.service(x.content));

    const list = new List(Object.keys(state.services).sort(), screen);
    list.on('select', x => screens.service(x));
    setScreen(list.render());
  },

  service: async (serviceName) => {
    const client = await ros.getService(serviceName);
    const template = ros.getServiceDefinition(client);
    if (template == "{}") {
      const response = await client.call({});
      setScreen(JSON.stringify(response, true, 2));
    } else {
      setScreen(`need input: ${template} -- not yet implemented`);
    }
  },

  tfTree: () => {
    const decorated = JSON.parse(JSON.stringify(ros.getTFForest()));
    decorateTFTree(decorated);
    log('after', decorated);
    const t = new Tree(decorated, screen, {
      renderer: treeNode => `${treeNode.name} ${treeNode.publisher ? `[${treeNode.publisher}]` : ''}`
    });
    let from;
    t.on('select', node => {
      log(node.name);
      if (!from) {
        from = node.name;
        bottomText.setContent(`From: ${from}`);
        bottomText.hidden = false;
        screen.render();
      } else {
        screens.tf(from, node.name);
        bottomText.setContent('');
        bottomText.hidden = true;
      }

      // log(line);
      // line._label += 'from';
      // t.render();
      // screen.render();
    });
    const rendered = t.render();
    setScreen(rendered);

    const update = () => {
      const decorated = JSON.parse(JSON.stringify(ros.getTFForest()));
      decorateTFTree(decorated);
      t.update(decorated);
      screen.render();
    };

    update();
    const interval = setInterval(update, 1000);
    t.on('destroy', () => {
      log('tree destroyed');
      bottomText.hidden = true;
      clearInterval(interval);
    });

    screen.key(['backspace'], function(ch, key) {
      log(ch, key);
      bottomText.setContent(`From: `);
      screen.render();
      from = null;
    });
  },

  /** tf echo */
  tf: (from, to) => {
    log('tf', from, to);

    const box = blessed.box();
    const info = blessed.text({
      style: {
        fg: '#aaaa00'
      },
      width: '100%',
      content: `${from} -> ${to}`,
      height: 1
    });
    box.append(info);

    const text = blessed.text({content: '', height: 15, top: 1});
    box.append(text);
    setScreen(box);

    // setScreen(text);
    const update = () => {
      const tf = ros.getTF(from, to);
      text.setContent(JSON.stringify(tf, 2, 2));
      screen.render();
    };
    update();
    const interval = setInterval(update, 100);
    text.on('destroy', () => {
      clearInterval(interval);
    });
  }
};

/** decorate TF tree with publisher names */
const decorateTFTree = (tree) => {
  _.each(tree, node => {
    node.publisher = node.custom && ros.getNodeName(node.custom.nodeUri);
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


// ---------------------------------------
// MAIN

screen.append(blessed.text({content: 'Connecting to ROS master..'}))
screen.render();

// Render the screen.
const ros = new ROS(log, () => {
    // Append our box to the screen.
    screen.
    screen.append(menu);
    screen.append(body);
    screen.append(bottomText);
    // Focus our element.
    menu.focus();
    setScreen('Select a tab (using number keys) to get started.');
    screen.render();
  }, [fs.createWriteStream('/tmp/ros-blessed.ros.log')]);
