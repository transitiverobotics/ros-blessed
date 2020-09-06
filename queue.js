
/** Simple, fixed size queue, extends array */
class Queue extends Array {
  constructor(size) {
    super();
    this.size = size;
  }

  add(value) {
    this.push(value);
    if (this.length > this.size) {
      this.shift();
    }
  }
}

module.exports = Queue;
