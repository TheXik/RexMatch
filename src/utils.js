import chalk from 'chalk';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const randomDelay = (min, max) =>
  sleep(Math.floor(Math.random() * (max - min)) + min);

export const log = {
  dino: (msg) => console.log(chalk.green(`🦕 ${msg}`)),
  like: (msg) => console.log(chalk.magenta(`💚 ${msg}`)),
  pass: (msg) => console.log(chalk.yellow(`💛 ${msg}`)),
  info: (msg) => console.log(chalk.blue(`ℹ️  ${msg}`)),
  success: (msg) => console.log(chalk.green(`✅ ${msg}`)),
  error: (msg) => console.log(chalk.red(`❌ ${msg}`)),
};
