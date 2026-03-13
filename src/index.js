import figlet from 'figlet';
import chalk from 'chalk';
import { RexMatchBot } from './bot.js';
import { Swiper } from './swiper.js';
import { Messenger } from './messenger.js';
import { ProfileAnalyzer } from './analyzer.js';
import { log, sleep, humanDelay } from './utils.js';

const args = process.argv.slice(2);
const modeArg = args.find((a) => a.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : 'full';

async function main() {
  console.log(
    chalk.green(
      figlet.textSync('RexMatch', { font: 'Big', horizontalLayout: 'default' })
    )
  );
  console.log(chalk.yellow('  🦕 Your prehistoric wingman — RAWR means I like you! 🦕\n'));

  const bot = new RexMatchBot();
  let analyzer = null;

  try {
    await bot.init();
    await bot.login();
    await humanDelay(2000, 4000);
    await bot.dismissPopups();

    // TRAIN MODE
    if (mode === 'train') {
      await bot.navigateToRecs();
      await bot.dismissPopups();
      analyzer = new ProfileAnalyzer(bot.page, bot.context);
      await analyzer.init();
      const countArg = args.find((a) => a.startsWith('--count='));
      const trainCount = countArg ? parseInt(countArg.split('=')[1]) : 20;
      await analyzer.train(trainCount);
      await analyzer.close();
      return;
    }

    // SMART MODE
    if (mode === 'smart') {
      await bot.navigateToRecs();
      await bot.dismissPopups();
      analyzer = new ProfileAnalyzer(bot.page, bot.context);
      await analyzer.init();
      const swiper = new Swiper(bot.page, analyzer);
      await swiper.swipe();
    }

    // SWIPE MODE
    if (mode === 'swipe') {
      await bot.navigateToRecs();
      await bot.dismissPopups();
      const swiper = new Swiper(bot.page);
      await swiper.swipe();
    }

    // FULL MODE — smart swipe + chat with break between
    if (mode === 'full') {
      await bot.navigateToRecs();
      await bot.dismissPopups();
      analyzer = new ProfileAnalyzer(bot.page, bot.context);
      await analyzer.init();
      const swiper = new Swiper(bot.page, analyzer);
      await swiper.swipe();

      // Take a natural break before switching to messages
      log.info('Taking a break before messaging...');
      await humanDelay(10000, 30000);

      await bot.navigateToMessages();
      const messenger = new Messenger(bot.page, bot.context);
      await messenger.processMatches();
    }

    // CHAT MODE
    if (mode === 'chat') {
      await bot.navigateToMessages();
      const messenger = new Messenger(bot.page, bot.context);
      await messenger.processMatches();
    }

    log.dino('All done! Rex had a great day 🦕❤️');
  } catch (err) {
    log.error(`Fatal error: ${err.message}`);
    console.error(err);
  } finally {
    await analyzer?.close();
    await sleep(2000);
    await bot.close();
  }
}

main();
