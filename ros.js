/**
  Thin adapter between the ros-blessed UI and @transitive-sdk/utils-ros.

  utils-ros gives us one interface for ROS 1 (rosnodejs) and ROS 2
  (rclnodejs). This class keeps the small API that index.js already uses and
  fills the few gaps (system graph, TF) per ROS version.
*/
const _ = require('lodash');
const tf = require('tf-rosnodejs');
const { ROSs, getForVersion } = require('@transitive-sdk/utils-ros');

/** Split 'pkg/Type' (ROS 1) or 'pkg/srv/Type' (ROS 2) into [pkg, Type]. */
const splitType = (type) => {
  const parts = type.split('/');
  return [parts[0], parts[parts.length - 1]];
};

let log;
class ROS {

  constructor(_log, cb) {
    log = _log;

    // Prefer the ROS version of the sourced workspace, else whatever
    // utils-ros found in /opt/ros.
    this.ros = getForVersion(process.env.ROS_VERSION) || ROSs[0];
    if (!this.ros) {
      throw new Error(
        'No ROS installation found. Source your ROS 1 or ROS 2 setup file.');
    }
    this.version = this.ros.rosVersion;
    this.nodes = {};

    this.ros.init().then(() => {
      this.initTF();
      this.updateState();
      setInterval(this.updateState.bind(this), 5000);
      cb();
    }).catch(error => {
      log('failed to initialize ROS', error);
      console.error(`Failed to connect to ROS ${this.version}:`, error.message);
      process.exit(1);
    });
  }

  /** Message type name in the format of the active ROS version. */
  type(pkg, name, category = 'msg') {
    return this.version == 1 ? `${pkg}/${name}` : `${pkg}/${category}/${name}`;
  }

  /** tf-rosnodejs only needs an object with a rosnodejs-like `subscribe`, so
  we give it one backed by utils-ros. This works for ROS 1 and ROS 2. */
  initTF() {
    const shim = {
      subscribe: (topic, _type, callback) =>
        this.ros.subscribe(topic, this.type('tf2_msgs', 'TFMessage'), callback)
    };
    tf.init(shim);
  }

  /** fetch the system graph and update the list of nodes we maintain */
  async updateState() {
    this.state = await this.getSystemState();
    if (this.version != 1) return; // node URIs only exist in ROS 1

    const nodeNames = _.uniq(_.flattenDeep([
      Object.values(this.state.publishers),
      Object.values(this.state.subscribers),
      Object.values(this.state.services) ]));
    const masterApi = this.ros.rn._node._masterApi;
    const all = await Promise.all(nodeNames.map(async name => {
      const resp = await masterApi.lookupNode('/ros-blessed', name, {});
      return {name, uri: resp[2]};
    }));
    const nodes = {};
    all.forEach(({name, uri}) => nodes[uri] = name);
    this.nodes = nodes;
  }

  getState() { return this.state; }

  getNodeName(nodeUri) { return this.nodes[nodeUri]; }

  /** List of published topics as {topics: [{name, type}]} */
  async getTopics() {
    const topics = await this.ros.getTopicsWithTypes();
    return {topics: topics.map(({name, type, types}) =>
      ({name, type: type || types[0]}))};
  }

  async subscribe(topic, callback) {
    const {topics} = await this.getTopics();
    const info = _.find(topics, {name: topic});
    if (!info) {
      log(`topic ${topic} not found`);
      return;
    }
    // ROS 1 also passes message size and publisher URI; ROS 2 only the message
    this.ros.subscribe(topic, info.type, (data, size, nodeUri) =>
      callback(data, info.type, size, nodeUri));
  }

  unsubscribe(topic) {
    this.ros.unsubscribe(topic);
  }

  /** Get {publishers, subscribers, services}, each mapping a topic/service
  name to the list of node names that provide/use it (ROS 1 master format). */
  async getSystemState() {
    if (this.version == 1) {
      return this.ros.rn._node._masterApi.getSystemState();
    }

    // ROS 2 has no master, so collect the same info from the ROS graph
    const node = this.ros.node;
    const state = {publishers: {}, subscribers: {}, services: {}};
    const add = (obj, key, value) => (obj[key] ||= []).push(value);

    node.getNodeNamesAndNamespaces().forEach(({name, namespace}) => {
      const fullName = `${namespace.replace(/\/$/, '')}/${name}`;
      node.getPublisherNamesAndTypesByNodeName(name, namespace)
        .forEach(t => add(state.publishers, t.name, fullName));
      node.getSubscriptionNamesAndTypesByNodeName(name, namespace)
        .forEach(t => add(state.subscribers, t.name, fullName));
      node.getServiceNamesAndTypesByNodeName(name, namespace)
        .forEach(t => add(state.services, t.name, fullName));
    });
    return state;
  }

  /** Get the type of the service and a template for its request. */
  async getService(serviceName) {
    const type = await this.ros.getServiceType(serviceName);
    if (!type) return null;
    const [pkg, name] = splitType(type);
    const template = this.ros.getTypeTemplate(pkg, 'srv', name);
    return {name: serviceName, type, template};
  }

  /** Call service, returns {success, response} or {success, error} */
  callService(service, request = {}) {
    return this.ros.callService(service.name, service.type, request);
  }

  getTFForest() {
    return tf.getForest();
  }

  getTF = tf.getTF;

  shutdown() {
    this.ros.shutdown();
    log('shut down ros node');
  }
};

module.exports = ROS;
