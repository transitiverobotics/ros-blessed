# ros-blessed
A blessed, "curses", toolbox for ROS. Like rqt but for the command line.

## Status and Roadmap

This is work in progress. So far this implements the basic functionality of the following checked items. All other items indicate future plans. PRs welcome!

- [ ] rostopic:
  - [x] list
  - [x] echo
  - [x] hz
  - [x] bw
  - [x] type
  - [ ] pub
  - [ ] find
  - [ ] info
- [ ] rosservice
  - [ ] list
  - [ ] call
  - [ ] info
  - [ ] args  
- [ ] tf
  - [ ] view tree
  - [ ] monitor
  - [ ] echo
- [ ] log levels
- [ ] rosnode
  - [ ] list
  - [ ] info


## Install

Make sure you have node.js installed. On Ubuntu:
```
sudo apt install nodejs
```

Then install ros-blessed:
```
sudo npm install -g ros-blessed
```

Make sure you have sourced your ROS workspace/installation, then call it using:
```
ros-blessed
```

## FAQ


### Why is it called ros-blessed not ros-curses?
Because it is based on the [blessed](https://www.npmjs.com/package/blessed) npm package, a reimplementation of curses in node.js.
