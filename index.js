#!/usr/bin/env node

'use strict';

const fs = require('fs');
const util = require('util');
const blessed = require('blessed');
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



const screens = {
  topics: async () => {
    const data = await ros.getTopics();
    const list = blessed.list({
      items: _.map(data.topics, 'name'),
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
  },



  topic: (topicName) => {
    log(topicName);
    setScreen(topicName);

    const box = blessed.box({});

    const info = blessed.text({
      style: {
        fg: '#aaaa00'
      }
    });

    const list = blessed.list({
      top: 1,
      keys: true,
      style: {
        selected: {
          fg: 'green'
        }
      },
    });
    list.on('select', x => log(Object.keys(x), x.index, x.position));

    box.append(info);
    box.append(list);
    setScreen(box);

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
          `Hz: ${hz.toLocaleString()}`,
          `Bandwidth: ${bw.toLocaleString()} KB/s`
        ].join(','));
      screen.render();
    };
    updateInfo();
    const interval = setInterval(updateInfo, 1000);

    box.on('destroy', () => {
      ros.unsubscribe(topicName);
      clearInterval(interval);
    });
  }
};


const menu = blessed.listbar({
  items: {
    topics: {
      keys: ['1'],
      callback: screens.topics
    },
    services: () => { setScreen('servc'); }
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

setScreen('Select a tab (using number keys) to get started.');

// Append our box to the screen.
screen.append(menu);
screen.append(body);

// ---------------------------------------
// MAIN

// Focus our element.
menu.focus();

// Render the screen.
console.log('connecting to ROS master');
const ros = new ROS(() => {
  blessed.program().clear(); // clear screen
  screen.render();
});
