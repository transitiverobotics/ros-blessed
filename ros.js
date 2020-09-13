const rosnodejs = require('rosnodejs');
const _ = require('lodash');
const tf = require('tf-rosnodejs');

// const std_msgs = rosnodejs.require('std_msgs').msg;
// const SetBool = rosnodejs.require('std_srvs').srv.SetBool;

class ROS {

  constructor(cb, logStreams = []) {
    rosnodejs.log.clearStreams(); // remove all existing log streams
    // TODO: show errors/warnings somewhere in the app, not just in file-log
    // see (below)

    rosnodejs.initNode('/ros_blessed', {
      node: { forceExit: true },
      logging: {streams: logStreams}
    }).then((rosNode) => {
      this.rn = rosNode;
      tf.init(rosNode);
      cb();
    });
  }

  async getTopics() {
    if (!this.rn) {
      console.warn('not connected to ROS master');
      return;
    }
    return this.rn._node._masterApi.getPublishedTopics();
  }

  async subscribe(topic, callback) {
    const response = await this.rn._node._masterApi.getPublishedTopics();
    const info = _.find(response.topics, {name: topic});
    this.rn.subscribe(topic, info.type, (data, size, nodeUri) =>
      callback(data, info.type, size, nodeUri));
  }

  unsubscribe(topic) {
    this.rn.unsubscribe(topic);
  }

  async getSystemState() {
    if (!this.rn) {
      console.warn('not connected to ROS master');
      return;
    }
    return this.rn._node._masterApi.getSystemState();
  }

  getTFForest() {
    return tf.getForest();
  }
};

module.exports = ROS;
