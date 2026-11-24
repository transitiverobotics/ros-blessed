/**
  Thin adapter between the ros-blessed UI and @transitive-sdk/utils-ros.

  utils-ros gives us one interface for ROS 1 (rosnodejs) and ROS 2
  (rclnodejs). This class keeps the small API that index.js already uses and
  adds TF on top. It only uses the public utils-ros API, so it does not
  depend on how utils-ros talks to ROS 1 or ROS 2.
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

    this.ros.init().then(() => {
      this.initTF();
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
    // ROS 1 also passes the message size; ROS 2 only the message
    this.ros.subscribe(topic, info.type, (data, size, nodeUri) =>
      callback(data, info.type, size, nodeUri));
  }

  unsubscribe(topic) {
    this.ros.unsubscribe(topic);
  }

  /** List of service names */
  getServices() {
    return this.ros.getServices();
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
