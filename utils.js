
const _ = require('lodash');

/** given an object like { a: 1, b: { b1: 1, b2: 2 } }, pretty print it
  while storing selectors for each line:
  [{line: "a: 1", selector: "a"},
  {line: "b: {", selector: "b"},
  {line: "  b1: 1", selector: "b.b1"},
  {line: "  b2: 2", selector: "b.b2"},
  {line: "}", selector: "b"},
  ]
*/
const decorateWithSelectors = (element, selectorSoFar = []) => {
  if (typeof element == 'object') {
    // recurse
    return _.reduce(element, (list, value, key) =>
      list = list.concat(decorateWithSelectors(value, selectorSoFar.concat([key])))
      , []);
  } else {
    const indentation = Array((selectorSoFar.length - 1) * 2).join(' ');
    return {
      line: `${indentation}${element}`,
      selector: selectorSoFar.join('.')
    };
  }
};

module.exports = {
  decorateWithSelectors
};
