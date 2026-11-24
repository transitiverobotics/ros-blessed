const assert = require('assert');
const Module = require('module');

/** Load ros.js with a fake @transitive-sdk/utils-ros providing `fake`. */
const loadWithFake = (fake) => {
  const origLoad = Module._load;
  Module._load = function(request, ...args) {
    if (request == '@transitive-sdk/utils-ros') {
      return { ROSs: [fake], getForVersion: () => fake };
    }
    return origLoad.call(this, request, ...args);
  };
  delete require.cache[require.resolve('./ros.js')];
  delete require.cache[require.resolve('tf-rosnodejs')];
  const ROS = require('./ros.js');
  Module._load = origLoad;
  return ROS;
};

const makeROS = (fake) => new Promise(resolve => {
  const ROS = loadWithFake(fake);
  const ros = new ROS(() => {}, () => resolve(ros));
});

const tfMsg = {transforms: [{
  header: {frame_id: 'map', stamp: {sec: 1, nanosec: 0}},
  child_frame_id: 'base_link',
  transform: {translation: {x: 1, y: 2, z: 0}, rotation: {x: 0, y: 0, z: 0, w: 1}}
}]};

describe('ROS adapter on ROS 2', () => {
  const subscriptions = {};
  const fake = {
    rosVersion: 2,
    init: async () => {},
    getTopicsWithTypes: async () =>
      [{name: '/chatter', types: ['std_msgs/msg/String']}],
    subscribe: (topic, type, cb) => subscriptions[topic] = {type, cb},
    unsubscribe: (topic) => delete subscriptions[topic],
    getServiceType: async () => 'std_srvs/srv/Trigger',
    getTypeTemplate: (pkg, cat, name) => (assert.deepEqual([pkg, cat, name],
      ['std_srvs', 'srv', 'Trigger']), {}),
    callService: async (name, type, req) => ({success: true, name, type, req}),
    node: {
      getNodeNamesAndNamespaces: () => [{name: 'talker', namespace: '/'}],
      getPublisherNamesAndTypesByNodeName: () => [{name: '/chatter'}],
      getSubscriptionNamesAndTypesByNodeName: () => [],
      getServiceNamesAndTypesByNodeName: () => [{name: '/talker/trigger'}],
    }
  };
  let ros;
  before(async () => ros = await makeROS(fake));

  it('normalizes topic types', async () => {
    assert.deepEqual(await ros.getTopics(),
      {topics: [{name: '/chatter', type: 'std_msgs/msg/String'}]});
  });

  it('builds the system state from the ROS 2 graph', async () => {
    assert.deepEqual(await ros.getSystemState(), {
      publishers: {'/chatter': ['/talker']},
      subscribers: {},
      services: {'/talker/trigger': ['/talker']}
    });
  });

  it('subscribes with the topic type and passes it to the callback', async () => {
    let got;
    await ros.subscribe('/chatter', (...args) => got = args);
    subscriptions['/chatter'].cb({data: 'hi'});
    assert.deepEqual(got, [{data: 'hi'}, 'std_msgs/msg/String', undefined, undefined]);
  });

  it('gets and calls a service', async () => {
    const service = await ros.getService('/talker/trigger');
    const result = await ros.callService(service);
    assert.deepEqual(result, {success: true, name: '/talker/trigger',
      type: 'std_srvs/srv/Trigger', req: {}});
  });

  it('feeds TF messages into the TF forest using ROS 2 types', () => {
    assert.equal(subscriptions['/tf'].type, 'tf2_msgs/msg/TFMessage');
    assert.equal(subscriptions['/tf_static'].type, 'tf2_msgs/msg/TFMessage');
    subscriptions['/tf'].cb(tfMsg);
    assert.ok(ros.getTFForest().map.children.base_link);
    assert.equal(ros.getTF('map', 'base_link').translation.x, 1);
  });
});

describe('ROS adapter on ROS 1', () => {
  const subscriptions = {};
  const masterApi = {
    getSystemState: async () => ({publishers: {'/chatter': ['/talker']},
      subscribers: {}, services: {}}),
    lookupNode: async () => [1, '', 'http://host:1234/']
  };
  const fake = {
    rosVersion: 1,
    init: async () => {},
    getTopicsWithTypes: async () => [{name: '/chatter', type: 'std_msgs/String'}],
    subscribe: (topic, type, cb) => subscriptions[topic] = {type, cb},
    rn: {_node: {_masterApi: masterApi}},
  };
  let ros;
  before(async () => ros = await makeROS(fake));

  it('uses ROS 1 TF types', () => {
    assert.equal(subscriptions['/tf'].type, 'tf2_msgs/TFMessage');
  });

  it('passes size and publisher URI through', async () => {
    let got;
    await ros.subscribe('/chatter', (...args) => got = args);
    subscriptions['/chatter'].cb({data: 'hi'}, 42, 'http://host:1234/');
    assert.deepEqual(got,
      [{data: 'hi'}, 'std_msgs/String', 42, 'http://host:1234/']);
  });

  it('maps node URIs to names', async () => {
    await ros.updateState();
    assert.equal(ros.getNodeName('http://host:1234/'), '/talker');
  });
});
