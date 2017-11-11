const { fork } = require('child_process');
const { join } = require('path');
const { createInterface } = require('readline');

module.exports = (neutrino, opts = {}) => {
  const options = Object.assign({}, opts, {});
  const registeredCommand = neutrino.commands[neutrino.options.command];

  neutrino.register(neutrino.options.command, (config, neutrino) => {
    // The fork middleware was the only middleware used by Neutrino prior
    // to running anything. We need to now prevent the default actions from
    // doing anything else.
    return Object.keys(config).length !== 0 ?
      registeredCommand(config, neutrino) :
      Promise.resolve();
  });

  neutrino.on('prerun', () => {
    const children = Object
      .keys(options.configs)
      .map((namespace) => {
        const middleware = options.configs[namespace];
        const script = join(__dirname, './neutrino-child');
        const child = fork(script, { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
        const stdout = createInterface({ input: child.stdout });
        const stderr = createInterface({ input: child.stderr });

        process.on('message', ([type, args]) => {
          neutrino.emit(`${namespace}:${type}`, ...args);
          neutrino.emit(`*:${type}`, type, ...args);
        });
        stdout.on('line', (message) => console.log(`[${namespace}] ${message}`));
        stderr.on('line', (message) => console.error(`[${namespace}] ${message}`));
        child.send([middleware, neutrino.options.args]);

        return child;
      });

    process.on('exit', () => {
      children.forEach(child => child.kill('SIGINT'));
    });
  });
};
