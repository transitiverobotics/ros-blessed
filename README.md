# ros-blessed
A blessed, "curses", toolbox for ROS. Like rqt but for the command line.

![demo](https://raw.githubusercontent.com/luminrobotics/ros-blessed/master/demo.gif)


## Status and Roadmap

This is work in progress. So far this implements the basic functionality of the following checked items. All other items indicate future plans. PRs welcome!

- [ ] rostopic:
  - [x] list
  - [x] echo
  - [x] hz
  - [x] bw
  - [x] type
  - [x] info
  - [ ] pub
  - [ ] find
- [ ] tf
  - [x] view tree
  - [ ] monitor
  - [x] echo
- [ ] rosnode
  - [ ] list
  - [ ] info
- [ ] rosservice
  - [x] list
  - [ ] call
    - [x] without argument
    - [ ] with argument
  - [ ] info
  - [x] args  
- [ ] log levels
- [ ] rosparam
  - [ ] list
  - [ ] get
  - [ ] set
  - [ ] delete

`rosmsg show` and `rossrv show` are partially accomplished by the pub/call methods for topics and services, respectively.


## Install

Make sure you have node.js installed. On Ubuntu:
```
sudo apt install nodejs
```

Then install ros-blessed:
```
sudo npm install -g ros-blessed
```
If you prefer to install this package in your user-space, without `sudo`, you can follow [these instructions](https://stackoverflow.com/a/59227497/1087119).


Make sure you have sourced your ROS workspace/installation, then call it using:
```
ros-blessed
```

## FAQ


### Why is it called ros-blessed not ros-curses?
Because it is based on the [blessed](https://www.npmjs.com/package/blessed) npm package, a reimplementation of curses in node.js.
