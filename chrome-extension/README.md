# <img src="public/icons/icon_48.png" width="45" align="left"> Container Timing

Chrome extension that sets the attribute `containertiming` to the HTML node of
the loaded documents, and registers an observer that dumps the `container` entries
to `console.log`.


## Prerequisites

You will need a version of node.js on you machine, preferably v20+.

## Install

The steps to setup this project are:

1. Clone the repo and run `git submodule update --init`
1. `npm i`
1. `npm run install-container-timing-polyfill`
1. `npm run build`.
1. Run Chromium with `--enable-blink-features=ContainerTiming --load-extension=PATH_TO_EXTENSION/build/

## Contribution

Suggestions and pull requests are welcomed!.

---

This project was bootstrapped with [Chrome Extension CLI](https://github.com/dutiyesh/chrome-extension-cli)

