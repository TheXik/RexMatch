import figlet from 'figlet';
import chalk from 'chalk';
import { RexMatchBot } from './bot.js';
import { Swiper } from './swiper.js';
import { Messenger } from './messenger.js';
import { log, sleep } from './utils.js';

const args = process.argv.slice(2);
const modeArg = args.find((a) => a.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : 'full';

async function main() {
  // Banner
  console.log(
    chalk.green(
      figlet.textSync('RexMatch', { font: 'Big', horizontalLayout: 'default' })
    )
  );
  console.log(chalk.yellow('  🦕 Your prehistoric wingman — RAWR means I like you! 🦕\n'));

  const bot = new RexMatchBot();

  try {
    await bot.init();
    await bot.login();
    await sleep(2000);
    await bot.dismissPopups();

    if (mode === 'swipe' || mode === 'full') {
      const swiper = new Swiper(bot.page);
      await swiper.swipe();
    }

    if (mode === 'chat' || mode === 'full') {
      const messenger = new Messenger(bot.page);
      await messenger.processMatches();
    }

    log.dino('All done! Rex had a great day 🦕❤️');
  } catch (err) {
    log.error(`Fatal error: ${err.message}`);
    console.error(err);
  } finally {
    await sleep(2000);
    await bot.close();
  }
}

main();
